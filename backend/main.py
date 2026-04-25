from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import cv2, base64, glob, numpy as np
from pathlib import Path

app = FastAPI(title="CrowdLess AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = YOLO("yolo11n.pt")

IMAGES = sorted(
    glob.glob("Inside-Bus-View-1/train/images/*.jpg")
    + glob.glob("Inside-Bus-View-1/train/images/*.png")
)
_idx = 0

CAPACITY  = 50
BOX_BGR   = (255, 82, 0)   # #0052FF in BGR
CONF      = 0.20           # lower threshold catches distant passengers
IMGSZ     = 1280           # higher res → better small-object detection
FAR_RATIO = 0.60           # top 60 % of frame = far/back of bus
SCALE_UP  = 2.0            # upscale factor for the far crop


def clahe_enhance(img: np.ndarray) -> np.ndarray:
    """Boost local contrast so dim far-away passengers become visible."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    cl = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([cl, a, b]), cv2.COLOR_LAB2BGR)


def nms(boxes: list, scores: list, iou_thr: float = 0.45) -> list:
    """Pure-numpy NMS — returns kept indices."""
    if not boxes:
        return []
    b = np.array(boxes, dtype=float)
    s = np.array(scores, dtype=float)
    x1, y1, x2, y2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    areas  = (x2 - x1) * (y2 - y1)
    order  = s.argsort()[::-1]
    keep   = []
    while order.size:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou   = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        order = order[1:][iou < iou_thr]
    return keep


def detect(img: np.ndarray) -> list[tuple]:
    """
    Two-pass detection:
      Pass 1 — full image at high resolution.
      Pass 2 — top FAR_RATIO of the image upscaled ×SCALE_UP (back of bus).
    Returns list of (x1, y1, x2, y2, conf) in original pixel coords.
    """
    h, w = img.shape[:2]
    enhanced = clahe_enhance(img)

    boxes, scores = [], []

    # ── Pass 1: full frame ────────────────────────────────────────────
    for box in MODEL(enhanced, classes=[0], verbose=False,
                     imgsz=IMGSZ, conf=CONF)[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        boxes.append([x1, y1, x2, y2])
        scores.append(float(box.conf[0]))

    # ── Pass 2: far/back region upscaled ─────────────────────────────
    far_h = int(h * FAR_RATIO)
    crop  = enhanced[:far_h, :]
    up    = cv2.resize(crop, (int(w * SCALE_UP), int(far_h * SCALE_UP)))

    for box in MODEL(up, classes=[0], verbose=False,
                     imgsz=IMGSZ, conf=CONF)[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        # Map back to original coordinates
        boxes.append([x1 / SCALE_UP, y1 / SCALE_UP,
                      x2 / SCALE_UP, y2 / SCALE_UP])
        scores.append(float(box.conf[0]))

    kept = nms(boxes, scores)
    return [(boxes[i][0], boxes[i][1], boxes[i][2], boxes[i][3], scores[i])
            for i in kept]


@app.get("/analyze")
def analyze(response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    global _idx

    if not IMAGES:
        return {"error": "No images found in dataset folder"}

    path   = IMAGES[_idx]
    _idx   = (_idx + 1) % len(IMAGES)

    img = cv2.imread(path)
    if img is None:
        return {"error": f"Cannot read {path}"}

    detections = detect(img)
    count = len(detections)

    # Draw boxes on the original (non-enhanced) image
    for (x1, y1, x2, y2, conf) in detections:
        ix1, iy1, ix2, iy2 = int(x1), int(y1), int(x2), int(y2)
        cv2.rectangle(img, (ix1, iy1), (ix2, iy2), BOX_BGR, 2)
        lbl = f"person {conf:.2f}"
        (lw, lh), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        cv2.rectangle(img, (ix1, iy1 - lh - 6), (ix1 + lw + 4, iy1), BOX_BGR, -1)
        cv2.putText(img, lbl, (ix1 + 2, iy1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

    _, buf       = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    image_b64    = base64.b64encode(buf).decode()
    percentage   = min(100, round(count / CAPACITY * 100))
    status       = "low" if percentage < 40 else "medium" if percentage < 75 else "high"

    return {
        "count":      count,
        "capacity":   CAPACITY,
        "percentage": percentage,
        "status":     status,
        "image_b64":  image_b64,
        "filename":   Path(path).name,
    }


@app.get("/health")
def health():
    return {"ok": True, "images": len(IMAGES)}
