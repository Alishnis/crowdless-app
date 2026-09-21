"""Method B — top-down camera + YOLO-Pose keypoints + line crossing.

Aimed at a camera mounted *above* the door, the geometry commercial APC systems
use. Instead of a whole bounding box (which balloons and shifts when people
press together), the counting point is an anatomical landmark: the midpoint of
the shoulders, falling back to the head cluster, then to the box centre. Under a
top-down view the shoulders stay separated even when bodies overlap, so the
counting point keeps its identity in a crowded doorway.
"""
from __future__ import annotations

import cv2
import numpy as np

from . import models
from .common import FONT, Detection, draw_trail, pick_device

# COCO-17 keypoint indices
NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHOULDER, R_SHOULDER = 5, 6
HEAD_IDS = (NOSE, L_EYE, R_EYE, L_EAR, R_EAR)

SKELETON = [(5, 6), (5, 7), (7, 9), (6, 8), (8, 10), (5, 11), (6, 12), (11, 12)]
KP_CONF = 0.30


class PoseMethod:
    id    = "pose"
    name  = "YOLO-Pose (top-down)"
    label = "B"

    def __init__(self, conf: float = 0.30, weights: str = "yolo11n-pose.pt",
                 imgsz: int = 640, tracker: str = "", kp_conf: float = KP_CONF, **_):
        self.conf    = conf
        self.weights = weights
        self.imgsz   = imgsz
        self.tracker = tracker or "bytetrack.yaml"
        # How sure the model must be about a joint before the anchor trusts it.
        self.kp_conf = kp_conf
        self.device  = pick_device()
        self.model   = None

    def prepare(self, video_path: str, w: int, h: int, **_):
        self.model = models.load(self.weights)

    def _anchor(self, kxy: np.ndarray, kcf: np.ndarray,
                box: tuple[float, float, float, float]) -> tuple[float, float, str]:
        """Pick the most reliable body landmark available for this person."""
        ls_ok = kcf[L_SHOULDER] > self.kp_conf
        rs_ok = kcf[R_SHOULDER] > self.kp_conf
        if ls_ok and rs_ok:
            p = (kxy[L_SHOULDER] + kxy[R_SHOULDER]) / 2
            return float(p[0]), float(p[1]), "shoulders"
        if ls_ok or rs_ok:
            p = kxy[L_SHOULDER] if ls_ok else kxy[R_SHOULDER]
            return float(p[0]), float(p[1]), "shoulder"

        head = [kxy[i] for i in HEAD_IDS if kcf[i] > self.kp_conf]
        if head:
            p = np.mean(head, axis=0)
            return float(p[0]), float(p[1]), "head"

        x1, y1, x2, y2 = box
        return (x1 + x2) / 2, (y1 + y2) / 2, "box"

    def process(self, frame: np.ndarray, frame_idx: int) -> tuple[list[Detection], np.ndarray]:
        res = self.model.track(frame, persist=True, conf=self.conf,
                               imgsz=self.imgsz, tracker=self.tracker,
                               device=self.device, verbose=False)[0]

        dets: list[Detection] = []
        boxes = res.boxes
        if boxes is not None and boxes.id is not None:
            xyxy = boxes.xyxy.cpu().numpy()
            ids  = boxes.id.cpu().numpy().astype(int)
            cfs  = boxes.conf.cpu().numpy()

            kxy = kcf = None
            if res.keypoints is not None and res.keypoints.xy is not None:
                kxy = res.keypoints.xy.cpu().numpy()
                kcf = (res.keypoints.conf.cpu().numpy()
                       if res.keypoints.conf is not None
                       else np.ones(kxy.shape[:2], dtype=np.float32))

            for i, ((x1, y1, x2, y2), tid, cf) in enumerate(zip(xyxy, ids, cfs)):
                box = (float(x1), float(y1), float(x2), float(y2))
                if kxy is not None and i < len(kxy):
                    px, py, src = self._anchor(kxy[i], kcf[i], box)
                    kp = kxy[i]
                    kc = kcf[i]
                else:
                    px, py, src = (x1 + x2) / 2, (y1 + y2) / 2, "box"
                    kp = kc = None
                dets.append(Detection(tid=int(tid), px=px, py=py, box=box,
                                      conf=float(cf),
                                      extra={"kp": kp, "kconf": kc, "anchor": src}))
        return dets, frame.copy()

    def draw(self, vis: np.ndarray, dets: list[Detection], counter):
        for d in dets:
            draw_trail(vis, counter.history_of(d.tid), counter.color_of(d.tid))
        for d in dets:
            col = counter.color_of(d.tid)
            kp, kc = d.extra.get("kp"), d.extra.get("kconf")
            if kp is not None:
                for a, b in SKELETON:
                    if kc[a] > self.kp_conf and kc[b] > self.kp_conf:
                        cv2.line(vis, (int(kp[a][0]), int(kp[a][1])),
                                 (int(kp[b][0]), int(kp[b][1])), (200, 200, 200), 1)
                for j in range(len(kp)):
                    if kc[j] > self.kp_conf:
                        cv2.circle(vis, (int(kp[j][0]), int(kp[j][1])), 2, (240, 200, 80), -1)
            if d.box:
                x1, y1, x2, y2 = (int(v) for v in d.box)
                cv2.rectangle(vis, (x1, y1), (x2, y2), col, 1)
                cv2.putText(vis, f"#{d.tid}", (x1 + 3, y1 - 5), FONT, 0.40, col, 1)
            # The anchor is what actually gets counted — draw it prominently
            cv2.circle(vis, (int(d.px), int(d.py)), 6, col, -1)
            cv2.circle(vis, (int(d.px), int(d.py)), 6, (255, 255, 255), 1)
