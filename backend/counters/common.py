"""Shared building blocks for the three passenger-counting methods.

Every method produces the same shape of output — a list of `Detection`s with a
stable track id and a single "counting point" — so the crossing logic, the
drawing and the metrics below are identical across methods. That is what makes
the three comparable on the same video.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass, field

import cv2
import numpy as np

# ─── Visual constants ─────────────────────────────────────────────────────────

CLR_ENTER   = (50,  210,  50)   # green BGR
CLR_EXIT    = (50,   80, 255)   # red BGR
CLR_NEUTRAL = (180, 180, 180)
CLR_LINE    = (0,   220,  80)
TRAIL_LEN   = 45

FONT = cv2.FONT_HERSHEY_SIMPLEX


# ─── Detection ────────────────────────────────────────────────────────────────

@dataclass
class Detection:
    """One tracked person in one frame."""
    tid: int
    px: float                       # counting point x
    py: float                       # counting point y
    box: tuple[float, float, float, float] | None = None   # x1,y1,x2,y2
    conf: float = 1.0
    extra: dict = field(default_factory=dict)              # keypoints, area, …


# ─── Counting line ────────────────────────────────────────────────────────────

class CountLine:
    """A virtual line with a dead-zone band around it.

    A track only changes side once it is *past* the band, which stops a person
    loitering exactly on the line from being counted over and over. Crossing
    side "a" → "b" is an ENTER (unless `invert`), "b" → "a" is an EXIT.
    """

    def __init__(self, ratio: float = 0.55, orientation: str = "h",
                 invert: bool = False, band: float = 0.03):
        self.ratio       = float(ratio)
        self.orientation = "v" if orientation.startswith("v") else "h"
        self.invert      = bool(invert)
        self.band        = float(band)

    def pos(self, w: int, h: int) -> float:
        """Pixel position of the line (y for horizontal, x for vertical)."""
        return (h if self.orientation == "h" else w) * self.ratio

    def band_px(self, w: int, h: int) -> float:
        return (h if self.orientation == "h" else w) * self.band

    def side(self, px: float, py: float, w: int, h: int) -> str | None:
        """'a' before the line, 'b' after it, None inside the dead zone."""
        val  = py if self.orientation == "h" else px
        line = self.pos(w, h)
        band = self.band_px(w, h)
        if val < line - band:
            return "a"
        if val > line + band:
            return "b"
        return None

    def draw(self, vis: np.ndarray):
        h, w = vis.shape[:2]
        p    = int(self.pos(w, h))
        b    = int(self.band_px(w, h))

        if self.orientation == "h":
            overlay = vis.copy()
            cv2.rectangle(overlay, (0, p - b), (w, p + b), (70, 70, 70), -1)
            cv2.addWeighted(overlay, 0.25, vis, 0.75, 0, vis)
            cv2.line(vis, (0, p), (w, p), CLR_LINE, 2)
            mid = w // 2
            # Arrow points the ENTER direction
            y0, y1 = (p - 20, p + 6) if not self.invert else (p + 20, p - 6)
            cv2.arrowedLine(vis, (mid, y0), (mid, y1), CLR_ENTER, 2, tipLength=0.4)
            cv2.putText(vis, "ENTER", (mid + 10, p - 8), FONT, 0.42, CLR_ENTER, 1)
        else:
            overlay = vis.copy()
            cv2.rectangle(overlay, (p - b, 0), (p + b, h), (70, 70, 70), -1)
            cv2.addWeighted(overlay, 0.25, vis, 0.75, 0, vis)
            cv2.line(vis, (p, 0), (p, h), CLR_LINE, 2)
            mid = h // 2
            x0, x1 = (p - 20, p + 6) if not self.invert else (p + 20, p - 6)
            cv2.arrowedLine(vis, (x0, mid), (x1, mid), CLR_ENTER, 2, tipLength=0.4)
            cv2.putText(vis, "ENTER", (p + 8, mid - 10), FONT, 0.42, CLR_ENTER, 1)


# ─── Line counter (shared by all three methods) ───────────────────────────────

class _TrackState:
    __slots__ = ("side", "cooldown", "history", "state", "color", "age")

    def __init__(self, side: str | None, px: float, py: float):
        self.side     = side
        self.cooldown = 0
        self.history  = [(px, py)]
        self.state    = "neutral"
        self.color    = CLR_NEUTRAL
        self.age      = 1


class LineCounter:
    """Counts side changes of tracked points across a `CountLine`."""

    def __init__(self, line: CountLine, cooldown: int = 12, min_age: int = 3):
        self.line     = line
        self.cooldown = cooldown
        self.min_age  = min_age
        self.in_count  = 0
        self.out_count = 0
        self.states: dict[int, _TrackState] = {}
        self.events: list[dict] = []

    def update(self, dets: list[Detection], w: int, h: int, frame_idx: int = 0):
        seen = set()
        for d in dets:
            seen.add(d.tid)
            side = self.line.side(d.px, d.py, w, h)
            st   = self.states.get(d.tid)

            if st is None:
                self.states[d.tid] = _TrackState(side, d.px, d.py)
                continue

            st.age += 1
            if st.cooldown > 0:
                st.cooldown -= 1
            st.history.append((d.px, d.py))
            if len(st.history) > TRAIL_LEN:
                st.history.pop(0)

            # Inside the dead zone the side is simply carried over
            if side is None or side == st.side:
                continue

            if st.side is not None and st.cooldown == 0 and st.age >= self.min_age:
                a_to_b = st.side == "a" and side == "b"
                entered = a_to_b != self.line.invert
                if entered:
                    self.in_count += 1
                    st.state, st.color = "entered", CLR_ENTER
                else:
                    self.out_count += 1
                    st.state, st.color = "exited", CLR_EXIT
                st.cooldown = self.cooldown
                self.events.append({
                    "frame": frame_idx,
                    "tid":   int(d.tid),
                    "type":  "in" if entered else "out",
                })
            st.side = side

        # Drop states of tracks that vanished long ago to bound memory
        if len(self.states) > 400:
            for tid in list(self.states)[:200]:
                if tid not in seen:
                    del self.states[tid]

    @property
    def current(self) -> int:
        return max(0, self.in_count - self.out_count)

    def color_of(self, tid: int):
        st = self.states.get(tid)
        return st.color if st else CLR_NEUTRAL

    def history_of(self, tid: int):
        st = self.states.get(tid)
        return st.history if st else []

    def state_of(self, tid: int) -> str:
        st = self.states.get(tid)
        return st.state if st else "neutral"


# ─── Simple centroid tracker (for the depth / blob method) ────────────────────

class CentroidTracker:
    """Nearest-neighbour tracker — assigns stable ids to blob centroids."""

    def __init__(self, max_dist: float = 120.0, max_missed: int = 8):
        self.max_dist   = max_dist
        self.max_missed = max_missed
        self._next_id   = 1
        self.objects: dict[int, dict] = {}   # tid → {x, y, missed}

    def update(self, points: list[tuple[float, float, dict]]) -> list[tuple[int, float, float, dict]]:
        for o in self.objects.values():
            o["missed"] += 1

        assigned: dict[int, tuple] = {}
        used_tids: set[int] = set()

        # Greedy nearest match, closest pairs first
        pairs = []
        for i, (x, y, meta) in enumerate(points):
            for tid, o in self.objects.items():
                dist = float(np.hypot(x - o["x"], y - o["y"]))
                if dist < self.max_dist:
                    pairs.append((dist, i, tid))
        pairs.sort()

        used_points: set[int] = set()
        for _, i, tid in pairs:
            if i in used_points or tid in used_tids:
                continue
            used_points.add(i)
            used_tids.add(tid)
            x, y, meta = points[i]
            self.objects[tid].update(x=x, y=y, missed=0)
            assigned[tid] = (x, y, meta)

        for i, (x, y, meta) in enumerate(points):
            if i in used_points:
                continue
            tid = self._next_id
            self._next_id += 1
            self.objects[tid] = {"x": x, "y": y, "missed": 0}
            assigned[tid] = (x, y, meta)

        for tid in [t for t, o in self.objects.items() if o["missed"] > self.max_missed]:
            del self.objects[tid]

        return [(tid, x, y, meta) for tid, (x, y, meta) in assigned.items()]


# ─── Drawing helpers ──────────────────────────────────────────────────────────

def draw_trail(vis: np.ndarray, pts, color):
    for i in range(1, len(pts)):
        alpha = i / len(pts)
        col   = tuple(int(c * alpha) for c in color)
        cv2.line(vis,
                 (int(pts[i - 1][0]), int(pts[i - 1][1])),
                 (int(pts[i][0]),     int(pts[i][1])),
                 col, max(1, int(3 * alpha)))


def draw_hud(vis: np.ndarray, counter: LineCounter, method_name: str, fps: float | None = None):
    h, w = vis.shape[:2]
    cv2.rectangle(vis, (0, 0), (w, 30), (0, 0, 0), -1)
    cv2.putText(vis, f"IN {counter.in_count}",   (8,        20), FONT, 0.52, CLR_ENTER,     1)
    cv2.putText(vis, f"OUT {counter.out_count}", (w // 4,   20), FONT, 0.52, CLR_EXIT,      1)
    cv2.putText(vis, f"NOW {counter.current}",   (w // 2,   20), FONT, 0.52, (230,230,230), 1)
    tag = method_name if fps is None else f"{method_name} {fps:.0f}fps"
    cv2.putText(vis, tag, (int(w * 0.72), 20), FONT, 0.42, (150, 190, 255), 1)


def encode_jpeg(vis: np.ndarray, quality: int = 72) -> str:
    ok, buf = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode() if ok else ""


def is_color_video(video_path: str) -> bool:
    """True when the video carries real colour (not depth/IR/grayscale)."""
    cap = cv2.VideoCapture(video_path)
    ok, f = cap.read()
    cap.release()
    if not ok or f is None or f.ndim < 3:
        return False
    diff = float(np.abs(f[:, :, 0].astype(np.int32) - f[:, :, 1].astype(np.int32)).mean())
    return diff > 3.0


def pick_device() -> str:
    """Prefer Apple-Silicon GPU when torch exposes it — big speed-up on macOS."""
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"
