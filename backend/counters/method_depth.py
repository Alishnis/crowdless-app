"""Method C — depth-style height map + blob tracking (no neural network).

This is the classical approach real ToF/stereo passenger counters use: a person
is not recognised as "a person", they are simply a mass that is closer to the
ceiling sensor than the floor behind them. With no depth sensor at hand, the
frame's luminance is treated as a stand-in height map and the static background
is subtracted — the same maths, a cheaper input.

Runs on CPU at hundreds of frames per second and is untouched by clothing,
colour or model bias, but it cannot tell a person from a suitcase.
"""
from __future__ import annotations

import cv2
import numpy as np

from .common import FONT, CentroidTracker, Detection, draw_trail

WARMUP = 25


class DepthMethod:
    id    = "depth"
    name  = "Depth / background blobs"
    label = "C"

    def __init__(self, min_area_ratio: float = 0.012, diff_thresh: int = 30,
                 max_dist_ratio: float = 0.25, colormap: bool = True,
                 max_aspect: float = 4.5, min_extent: float = 0.30,
                 cut_thresh: float = 28.0, **_):
        self.min_area_ratio = min_area_ratio
        self.diff_thresh    = diff_thresh
        self.max_dist_ratio = max_dist_ratio
        self.colormap       = colormap
        # Shape gates: a person seen from above is a compact blob. Overlay
        # graphics and lighting seams are thin or sparse, and get rejected.
        self.max_aspect     = max_aspect
        self.min_extent     = min_extent
        self.cut_thresh     = cut_thresh

        self.bg: np.ndarray | None = None
        self.vid_max  = 255.0
        self.mog      = None
        self.warmup   = 0
        self.tracker: CentroidTracker | None = None
        self.min_area = 500
        self._last_fg: np.ndarray | None = None
        self._prev_gray: np.ndarray | None = None
        self.cuts = 0

    # ── background estimation ────────────────────────────────────────────────
    def prepare(self, video_path: str, w: int, h: int,
                start_frame: int = 0, end_frame: int | None = None, **_):
        self.min_area = max(120, int(self.min_area_ratio * w * h))
        self.tracker  = CentroidTracker(max_dist=self.max_dist_ratio * max(w, h),
                                        max_missed=8)
        self.bg, self.vid_max = self._median_bg(video_path, w, h,
                                                start_frame=start_frame,
                                                end_frame=end_frame)
        if self.bg is None:
            self.mog = cv2.createBackgroundSubtractorMOG2(
                history=400, varThreshold=10, detectShadows=False)

    @staticmethod
    def _median_bg(video_path: str, w: int, h: int, n: int = 40,
                   start_frame: int = 0, end_frame: int | None = None):
        """Per-pixel median over the analysed segment — the doorway with people erased.

        Sampling only the segment matters: these clips open with unrelated
        marketing footage that would otherwise poison the background estimate.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None, 255.0
        total = max(1, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
        stop  = min(end_frame or total, total)
        span  = max(1, stop - start_frame)
        step  = max(1, span // n)

        frames, idx = [], start_frame
        while len(frames) < n and idx < stop:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, f = cap.read()
            if not ok:
                break
            g = cv2.cvtColor(cv2.resize(f, (w, h)), cv2.COLOR_BGR2GRAY)
            frames.append(g.astype(np.float32))
            idx += step
        cap.release()

        if len(frames) < 5:
            return None, 255.0
        vid_max = float(np.median([fr.max() for fr in frames]))
        return np.median(np.stack(frames), axis=0).astype(np.uint8), max(vid_max, 1.0)

    # ── per-frame ────────────────────────────────────────────────────────────
    def _foreground(self, gray: np.ndarray) -> np.ndarray:
        if self.bg is not None:
            diff  = cv2.absdiff(gray, self.bg)
            scale = 255.0 / self.vid_max if self.vid_max < 200 else 1.0
            diff  = np.clip(diff.astype(np.float32) * scale, 0, 255).astype(np.uint8)
            _, fg = cv2.threshold(diff, self.diff_thresh, 255, cv2.THRESH_BINARY)
        else:
            fg = self.mog.apply(gray)
            self.warmup += 1
            if self.warmup < WARMUP:
                return np.zeros_like(fg)

        k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k5)
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,  k3)
        return fg

    def _handle_scene_cut(self, gray: np.ndarray) -> bool:
        """A hard cut invalidates the background — rebuild it from this frame.

        Promo reels splice several doorways together; without this the stale
        background paints the whole new scene as foreground and every blob
        crossing the line gets counted.
        """
        if self._prev_gray is None:
            self._prev_gray = gray
            return False
        change = float(cv2.absdiff(gray, self._prev_gray).mean())
        self._prev_gray = gray
        if change < self.cut_thresh:
            return False

        self.cuts += 1
        self.bg = gray.copy()
        if self.mog is not None:
            self.mog = cv2.createBackgroundSubtractorMOG2(
                history=400, varThreshold=10, detectShadows=False)
            self.warmup = 0
        # Fresh ids after a cut: old tracks must not match new blobs
        if self.tracker is not None:
            self.tracker.objects.clear()
        return True

    def process(self, frame: np.ndarray, frame_idx: int) -> tuple[list[Detection], np.ndarray]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        cut  = self._handle_scene_cut(gray)
        fg   = np.zeros_like(gray) if cut else self._foreground(gray)
        self._last_fg = fg

        # Let the background creep toward the scene wherever nobody stands,
        # so slow lighting drift does not turn into permanent foreground.
        if self.bg is not None and not cut:
            still = fg == 0
            self.bg[still] = (0.98 * self.bg[still] + 0.02 * gray[still]).astype(np.uint8)

        points: list[tuple[float, float, dict]] = []
        contours = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < self.min_area:
                continue
            x, y, bw, bh = cv2.boundingRect(cnt)
            if bw == 0 or bh == 0:
                continue
            aspect = max(bw / bh, bh / bw)
            extent = area / float(bw * bh)
            if aspect > self.max_aspect or extent < self.min_extent:
                continue
            M = cv2.moments(cnt)
            if M["m00"] <= 0:
                continue
            points.append((M["m10"] / M["m00"], M["m01"] / M["m00"],
                           {"area": float(area), "rect": (x, y, x + bw, y + bh)}))

        dets = [
            Detection(tid=tid, px=x, py=y,
                      box=meta["rect"], extra={"area": meta["area"]})
            for tid, x, y, meta in self.tracker.update(points)
        ]

        # Height-map style base image — what a depth sensor would show
        base = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        if self.colormap:
            vis = cv2.applyColorMap(base, cv2.COLORMAP_BONE)
        else:
            vis = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
        if fg.any():
            ov = vis.copy()
            ov[fg > 0] = (60, 200, 90)
            vis = cv2.addWeighted(vis, 0.7, ov, 0.3, 0)
        return dets, vis

    def draw(self, vis: np.ndarray, dets: list[Detection], counter):
        for d in dets:
            draw_trail(vis, counter.history_of(d.tid), counter.color_of(d.tid))
        for d in dets:
            col = counter.color_of(d.tid)
            if d.box:
                x1, y1, x2, y2 = (int(v) for v in d.box)
                cv2.rectangle(vis, (x1, y1), (x2, y2), col, 1)
            cv2.circle(vis, (int(d.px), int(d.py)), 9, col, -1)
            cv2.circle(vis, (int(d.px), int(d.py)), 9, (255, 255, 255), 1)
            cv2.putText(vis, f"#{d.tid}", (int(d.px) - 8, int(d.py) - 13), FONT, 0.38, col, 1)
