"""Method A — RGB camera + YOLO detection + ByteTrack + line crossing.

The cheapest option: works with any ordinary colour camera already mounted in
the saloon. YOLO finds every person, ByteTrack keeps a stable id across frames,
and the counting point is the *bottom-centre* of the box (roughly where the feet
touch the floor), which moves far more predictably than the box centre when a
person is partly occluded by the crowd.
"""
from __future__ import annotations

import cv2
import numpy as np

from . import models
from .common import (FONT, Detection, draw_trail, pick_device)


class BBoxMethod:
    id    = "bbox"
    name  = "YOLO + ByteTrack"
    label = "A"

    def __init__(self, conf: float = 0.35, weights: str = "yolov8n.pt",
                 point: str = "bottom", imgsz: int = 640, tracker: str = "", **_):
        self.conf    = conf
        self.weights = weights
        self.point   = point          # "bottom" | "center"
        self.imgsz   = imgsz
        self.tracker = tracker or "bytetrack.yaml"
        self.device  = pick_device()
        self.model   = None

    def prepare(self, video_path: str, w: int, h: int, **_):
        self.model = models.load(self.weights)

    def process(self, frame: np.ndarray, frame_idx: int) -> tuple[list[Detection], np.ndarray]:
        res = self.model.track(frame, persist=True, classes=[0], conf=self.conf,
                               imgsz=self.imgsz, tracker=self.tracker,
                               device=self.device, verbose=False)[0]

        dets: list[Detection] = []
        boxes = res.boxes
        if boxes is not None and boxes.id is not None:
            xyxy = boxes.xyxy.cpu().numpy()
            ids  = boxes.id.cpu().numpy().astype(int)
            cfs  = boxes.conf.cpu().numpy()
            for (x1, y1, x2, y2), tid, cf in zip(xyxy, ids, cfs):
                cx = (x1 + x2) / 2
                cy = y2 - (y2 - y1) * 0.15 if self.point == "bottom" else (y1 + y2) / 2
                dets.append(Detection(tid=int(tid), px=float(cx), py=float(cy),
                                      box=(float(x1), float(y1), float(x2), float(y2)),
                                      conf=float(cf)))
        return dets, frame.copy()

    def draw(self, vis: np.ndarray, dets: list[Detection], counter):
        for d in dets:
            draw_trail(vis, counter.history_of(d.tid), counter.color_of(d.tid))
        for d in dets:
            col = counter.color_of(d.tid)
            if d.box:
                x1, y1, x2, y2 = (int(v) for v in d.box)
                cv2.rectangle(vis, (x1, y1), (x2, y2), col, 2)
                cv2.putText(vis, f"#{d.tid}", (x1 + 3, y1 - 5), FONT, 0.40, col, 1)
            cv2.circle(vis, (int(d.px), int(d.py)), 4, col, -1)
            cv2.circle(vis, (int(d.px), int(d.py)), 4, (255, 255, 255), 1)
