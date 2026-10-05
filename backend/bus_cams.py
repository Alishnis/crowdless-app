"""Simulated bus cameras for the demo: one door camera per bus slot.

Each slot replays real doorway footage from the PAMELA-UANDES benchmark clips
through method D, so the picture and the in/out counts on screen are genuine
detections, not animation. Playlists alternate "alighting" clips (the A_* set,
where people walk out of the door) with "boarding" clips (the B_No_* set, the
opposite direction), so a bus fills and empties instead of only ever filling.

The occupancy shown is `base + boarded - alighted`, clamped to the bus size —
the footage supplies the movement, the base only says how full the bus was
when the camera started.

PAMELA-UANDES is research-only (Velastin et al., 2020): these clips are never
bundled into the Docker image, so on a deployment without `test_data/` the
endpoint simply reports that no camera footage is available.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass

import cv2

from . import benchmarks
from .counters.common import CountLine, LineCounter, encode_jpeg
from .counters.method_head import HeadMethod
from .training.import_pamela import ROOT

SLOTS = 6
CAPACITY = 50
WINDOW_S = 22.0          # length of one clip window on a camera
MAX_FRAMES_PER_STEP = 10  # cap so a slow poll never freezes the server
OUT_WIDTH = 640


@dataclass
class Segment:
    path: str
    clip: str
    start: float
    seconds: float
    line_ratio: float
    orientation: str
    invert: bool
    activity: str  # "boarding" | "alighting"


def _busiest_window(events: list[dict], lo: float, hi: float) -> float:
    """Start time of the WINDOW_S stretch with the most crossings."""
    times = sorted(e["t"] for e in events)
    best_start, best_n = lo, -1
    for t0 in times or [lo]:
        start = max(lo, min(t0 - 2.0, hi - WINDOW_S))
        n = sum(start <= t <= start + WINDOW_S for t in times)
        if n > best_n:
            best_start, best_n = start, n
    return max(lo, best_start)


def _load_segments() -> tuple[list[Segment], list[Segment]]:
    """(boarding, alighting) windows built from the annotated benchmarks."""
    boarding: list[Segment] = []
    alighting: list[Segment] = []
    for rec in benchmarks.load_all():
        path = os.path.join(ROOT, rec["clip"])
        if not os.path.exists(path) or not rec.get("events"):
            continue
        lo, hi = rec["start_seconds"], rec["end_seconds"]
        start = _busiest_window(rec["events"], lo, hi)
        # The A_* and B_No_* clips are filmed with people walking in opposite
        # directions across the line, which is why the benchmarks carry
        # opposite `invert` flags. One fixed reading for every clip keeps that
        # difference: A_* (people leaving) counts OUT, B_No_* counts IN.
        seg = Segment(path=path, clip=os.path.splitext(rec["clip"])[0],
                      start=start, seconds=min(WINDOW_S, hi - start),
                      line_ratio=rec["line_ratio"], orientation=rec["orientation"],
                      invert=True,
                      activity="alighting" if not rec["invert"] else "boarding")
        (alighting if not rec["invert"] else boarding).append(seg)
    return boarding, alighting


def _playlist(slot: int, boarding: list[Segment], alighting: list[Segment]) -> list[Segment]:
    """Alternate the two directions; each slot starts at a different clip."""
    if not boarding or not alighting:
        return boarding or alighting
    n = max(len(boarding), len(alighting))
    out: list[Segment] = []
    first_boarding = slot % 2 == 0
    for k in range(n):
        b = boarding[(slot + k) % len(boarding)]
        a = alighting[(slot + k) % len(alighting)]
        out.extend([b, a] if first_boarding else [a, b])
    return out


class BusCamera:
    def __init__(self, slot: int, playlist: list[Segment]):
        self.slot = slot
        self.playlist = playlist
        # Slots that open on an alighting clip start fuller, so they have
        # someone to let off before the boarding clip fills them again.
        self.base = 20 + (slot * 5) % 15 + (14 if slot % 2 else 0)
        self.seg_idx = -1
        self.seg: Segment | None = None
        self.cap = None
        self.method: HeadMethod | None = None
        self.counter: LineCounter | None = None
        self.fps = 25.0
        self.w = self.h = 0
        self.frames_left = 0
        self.in_total = 0
        self.out_total = 0
        self.last_t: float | None = None

    def _bank(self):
        """Fold the finished segment's crossings into the running totals."""
        if self.counter is not None:
            self.in_total += self.counter.in_count
            self.out_total += self.counter.out_count
            self.counter = None

    def _open_next(self) -> bool:
        if self.cap is not None:
            self.cap.release()
        self._bank()
        for _ in range(len(self.playlist)):
            self.seg_idx = (self.seg_idx + 1) % len(self.playlist)
            seg = self.playlist[self.seg_idx]
            cap = cv2.VideoCapture(seg.path)
            if cap.isOpened():
                break
            cap.release()
        else:
            return False

        self.seg, self.cap = seg, cap
        self.fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        scale = min(1.0, 640 / max(1, src_w))
        self.w, self.h = int(src_w * scale), int(src_h * scale)
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(seg.start * self.fps))
        self.frames_left = int(seg.seconds * self.fps)

        self.method = HeadMethod()
        self.method.prepare(seg.path, self.w, self.h)
        self.counter = LineCounter(
            CountLine(seg.line_ratio, seg.orientation, seg.invert),
            cooldown=12, min_age=3)
        return True

    def _frames_due(self) -> int:
        now = time.time()
        dt = 0.4 if self.last_t is None else now - self.last_t
        self.last_t = now
        return max(1, min(MAX_FRAMES_PER_STEP, round(dt * self.fps)))

    def step(self) -> dict:
        if not self.playlist:
            return {"error": "No camera footage on this deployment"}
        vis = None
        for _ in range(self._frames_due()):
            if self.cap is None or self.frames_left <= 0:
                if not self._open_next():
                    return {"error": "Cannot read camera footage"}
            ok, frame = self.cap.read()
            if not ok:
                self.frames_left = 0
                continue
            self.frames_left -= 1
            small = cv2.resize(frame, (self.w, self.h))
            dets, vis = self.method.process(small, 0)
            self.counter.update(dets, self.w, self.h)
            self.counter.line.draw(vis)
            self.method.draw(vis, dets, self.counter)
        if vis is None:
            return {"error": "Cannot read camera footage"}

        if OUT_WIDTH != vis.shape[1]:
            vis = cv2.resize(vis, (OUT_WIDTH, int(vis.shape[0] * OUT_WIDTH / vis.shape[1])),
                             interpolation=cv2.INTER_CUBIC)

        in_c = self.in_total + self.counter.in_count
        out_c = self.out_total + self.counter.out_count
        count = max(0, min(CAPACITY, self.base + in_c - out_c))
        pct = min(100, round(count / CAPACITY * 100))
        return {
            "slot": self.slot,
            "count": count, "capacity": CAPACITY, "percentage": pct,
            "status": "low" if pct < 40 else "medium" if pct < 75 else "high",
            "in_count": in_c, "out_count": out_c,
            "activity": self.seg.activity,
            "source": self.seg.clip,
            "image_b64": encode_jpeg(vis, 80),
        }


class BusCameras:
    """Lazily built set of SLOTS cameras. Steps are serialised by the caller."""

    def __init__(self):
        self._cams: dict[int, BusCamera] = {}
        self._segments: tuple[list[Segment], list[Segment]] | None = None

    def segments(self) -> tuple[list[Segment], list[Segment]]:
        if self._segments is None:
            self._segments = _load_segments()
        return self._segments

    def available(self) -> bool:
        b, a = self.segments()
        return bool(b or a)

    def step(self, slot: int) -> dict:
        slot %= SLOTS
        cam = self._cams.get(slot)
        if cam is None:
            b, a = self.segments()
            cam = self._cams[slot] = BusCamera(slot, _playlist(slot, b, a))
        return cam.step()
