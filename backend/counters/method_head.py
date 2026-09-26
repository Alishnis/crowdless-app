"""Method D — overhead head detector + occlusion-tolerant head tracker.

Built for the case methods A–C fail on: a continuous, shoulder-to-shoulder
queue through a door (PAMELA-UANDES). The design follows what the literature
says works there, not what worked on sparse single crossings:

* **Detect heads, not bodies.** From a ceiling camera the bodies of a queue
  overlap, but the heads — the part closest to the lens — stay separate. This is
  the premise of both the PAMELA-UANDES baseline (Velastin et al. 2020, Sensors
  20(21):6251, YOLOv3 head detector, counting F1 ≈ 95%) and HeadHunter-T
  (Sundararaman et al., CVPR 2021, "Tracking Pedestrian Heads in Dense Crowd").
  The detector is trained on PAMELA's real head boxes, clips R1–R3 only.

* **Associate by distance in head-widths, not by IoU.** A head is ~32 px, and a
  person walking briskly moves a large fraction of that between frames, so the
  IoU of consecutive boxes collapses to zero exactly when people move fastest.
  A constant-velocity Kalman prediction plus a gate measured in head sizes
  keeps the match.

* **Two-stage matching (the ByteTrack idea).** A head half-hidden behind a
  taller neighbour drops to low confidence. Such detections are never allowed
  to *start* a track — that is what makes phantoms — but they may *continue*
  one, which is what keeps an identity alive through a partial occlusion.

* **Coast through short misses.** An unmatched track keeps predicting for up to
  `max_lost` frames and is re-attached on reappearance with the same id, so a
  person briefly swallowed by the crowd is not counted twice or not at all.

The output is the tracker's filtered head centre with a stable id, so the
shared `LineCounter` counts it exactly as it counts every other method — and
exactly as the ground truth, which is PAMELA's annotated head centres fed
through the same counter.
"""
from __future__ import annotations

import cv2
import lap
import numpy as np

from . import models
from .common import FONT, Detection, draw_trail, pick_device

DEFAULT_WEIGHTS = "models/pamela_head.pt"


# ─── Kalman-filtered track ────────────────────────────────────────────────────

class _Track:
    """Constant-velocity Kalman filter on the head centre, size smoothed apart."""

    # Motion model noise, in pixels at the native 352x288. Heads accelerate
    # gently; the measurement (a box centre) jitters by a couple of pixels.
    Q_POS, Q_VEL, R_MEAS = 1.0, 0.5, 2.0

    def __init__(self, tid: int, x: float, y: float, size: float, conf: float):
        self.tid   = tid
        self.x     = np.array([x, y, 0.0, 0.0])
        self.P     = np.diag([10.0, 10.0, 25.0, 25.0])
        self.size  = size
        self.conf  = conf
        self.hits  = 1
        self.lost  = 0
        self.box: tuple[float, float, float, float] | None = None

    _F = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], float)
    _H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)

    def predict(self):
        # A coasting track slows down: without fresh evidence, a long
        # extrapolation would carry it off through a crowd of other people.
        if self.lost > 0:
            self.x[2:] *= 0.85
        self.x = self._F @ self.x
        Q = np.diag([self.Q_POS, self.Q_POS, self.Q_VEL, self.Q_VEL])
        self.P = self._F @ self.P @ self._F.T + Q

    def update(self, x: float, y: float, size: float, conf: float, box):
        z = np.array([x, y])
        S = self._H @ self.P @ self._H.T + np.eye(2) * self.R_MEAS
        K = self.P @ self._H.T @ np.linalg.inv(S)
        self.x = self.x + K @ (z - self._H @ self.x)
        self.P = (np.eye(4) - K @ self._H) @ self.P
        self.size = 0.8 * self.size + 0.2 * size
        self.conf = conf
        self.box  = box
        self.hits += 1
        self.lost = 0

    @property
    def pos(self) -> tuple[float, float]:
        return float(self.x[0]), float(self.x[1])


class HeadTracker:
    def __init__(self, conf_hi: float = 0.50, conf_lo: float = 0.15,
                 gate: float = 1.0, max_lost: int = 25, n_init: int = 3):
        self.conf_hi  = conf_hi
        self.conf_lo  = conf_lo
        self.gate     = gate        # max match distance, in head widths
        self.max_lost = max_lost    # frames a track may coast unseen
        self.n_init   = n_init      # hits before a track is reported
        self.tracks: list[_Track] = []
        self._next = 1

    def _match(self, tracks: list[_Track], dets: np.ndarray, gate_scale: np.ndarray):
        """Min-cost assignment on centre distance normalised by head size."""
        if not tracks or len(dets) == 0:
            return [], list(range(len(tracks))), list(range(len(dets)))
        tp = np.array([t.pos for t in tracks])
        ts = np.array([t.size for t in tracks])
        dc = dets[:, :2]
        size = (ts[:, None] + dets[None, :, 2]) / 2
        cost = np.linalg.norm(tp[:, None, :] - dc[None, :, :], axis=2) / size
        # A track that has been coasting is less certain of where it is
        cost = cost / gate_scale[:, None]
        _, rows, _ = lap.lapjv(cost, extend_cost=True, cost_limit=self.gate)
        pairs = [(i, int(j)) for i, j in enumerate(rows) if j >= 0]
        mt = {i for i, _ in pairs}
        md = {j for _, j in pairs}
        return (pairs,
                [i for i in range(len(tracks)) if i not in mt],
                [j for j in range(len(dets)) if j not in md])

    def update(self, dets: np.ndarray) -> list[_Track]:
        """dets: (N, 7) array of cx, cy, size, conf, x1, y1, ... (x2, y2 appended)."""
        for t in self.tracks:
            t.predict()

        hi = dets[dets[:, 3] >= self.conf_hi] if len(dets) else dets
        lo = dets[(dets[:, 3] >= self.conf_lo) & (dets[:, 3] < self.conf_hi)] \
            if len(dets) else dets

        def scale_of(ts):
            return np.array([1.0 + 0.05 * t.lost for t in ts])

        # Stage 1: confident heads against every live track
        pairs, un_t, un_d = self._match(self.tracks, hi, scale_of(self.tracks))
        for ti, di in pairs:
            self._apply(self.tracks[ti], hi[di])

        # Stage 2: weak heads may only continue a track, never start one
        rest = [self.tracks[i] for i in un_t]
        pairs2, un_t2, _ = self._match(rest, lo, scale_of(rest))
        for ti, di in pairs2:
            self._apply(rest[ti], lo[di])

        for ti in un_t2:
            rest[ti].lost += 1

        for di in un_d:
            d = hi[di]
            t = _Track(self._next, d[0], d[1], d[2], d[3])
            t.box = tuple(d[4:8])
            self._next += 1
            self.tracks.append(t)

        # Tentative tracks die on their first miss; confirmed ones coast
        self.tracks = [t for t in self.tracks
                       if (t.lost == 0) or (t.hits >= self.n_init and t.lost <= self.max_lost)]
        return [t for t in self.tracks if t.hits >= self.n_init and t.lost == 0]

    @staticmethod
    def _apply(t: _Track, d: np.ndarray):
        t.update(d[0], d[1], d[2], d[3], tuple(d[4:8]))


# ─── Method ───────────────────────────────────────────────────────────────────

class HeadMethod:
    id    = "head"
    name  = "Head detector + head tracker"
    label = "D"

    # Defaults are the tracker sweep's winner on the R4 dev clips
    # (runs/head_best.json) — chosen without ever looking at R5–R8.
    def __init__(self, weights: str = DEFAULT_WEIGHTS, imgsz: int = 384,
                 conf_hi: float = 0.40, conf_lo: float = 0.10, gate: float = 0.7,
                 max_lost: int = 25, n_init: int = 5, **_):
        self.weights = weights
        self.imgsz   = imgsz
        self.device  = pick_device()
        self.model   = None
        self.tracker = HeadTracker(conf_hi, conf_lo, gate, max_lost, n_init)

    def prepare(self, video_path: str, w: int, h: int, **_):
        self.model = models.load(self.weights)

    def detect(self, frame: np.ndarray) -> np.ndarray:
        """Raw head detections as rows of cx, cy, size, conf, x1, y1, x2, y2."""
        res = self.model.predict(frame, imgsz=self.imgsz, conf=self.tracker.conf_lo,
                                 iou=0.5, device=self.device, verbose=False)[0]
        if res.boxes is None or len(res.boxes) == 0:
            return np.zeros((0, 8))
        xyxy = res.boxes.xyxy.cpu().numpy()
        conf = res.boxes.conf.cpu().numpy()
        cx = (xyxy[:, 0] + xyxy[:, 2]) / 2
        cy = (xyxy[:, 1] + xyxy[:, 3]) / 2
        size = ((xyxy[:, 2] - xyxy[:, 0]) + (xyxy[:, 3] - xyxy[:, 1])) / 2
        return np.column_stack([cx, cy, size, conf, xyxy])

    def track(self, dets: np.ndarray) -> list[Detection]:
        return [Detection(tid=t.tid, px=t.pos[0], py=t.pos[1], box=t.box, conf=t.conf)
                for t in self.tracker.update(dets)]

    def process(self, frame: np.ndarray, frame_idx: int) -> tuple[list[Detection], np.ndarray]:
        return self.track(self.detect(frame)), frame.copy()

    def draw(self, vis: np.ndarray, dets: list[Detection], counter):
        for d in dets:
            draw_trail(vis, counter.history_of(d.tid), counter.color_of(d.tid))
        for d in dets:
            col = counter.color_of(d.tid)
            if d.box:
                x1, y1, x2, y2 = (int(v) for v in d.box)
                cv2.ellipse(vis, ((x1 + x2) // 2, (y1 + y2) // 2),
                            (max(1, (x2 - x1) // 2), max(1, (y2 - y1) // 2)),
                            0, 0, 360, col, 2)
            cv2.circle(vis, (int(d.px), int(d.py)), 3, col, -1)
            cv2.putText(vis, f"#{d.tid}", (int(d.px) + 6, int(d.py) - 6), FONT, 0.38, col, 1)
