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

# Pose model detects 17 keypoints per person — works even when
# the body is hidden behind seats (head keypoints still visible).
MODEL = YOLO("yolo11n-pose.pt")  # auto-downloads on first run

IMAGES = sorted(
    glob.glob("Inside-Bus-View-1/train/images/*.jpg")
    + glob.glob("Inside-Bus-View-1/train/images/*.png")
)
_idx = 0

CAPACITY   = 50
BOX_BGR    = (255, 82, 0)   # #0052FF in BGR
HEAD_BGR   = (255, 82, 0)
CONF       = 0.18           # low threshold — catch far/small heads
IMGSZ      = 1280
FAR_RATIO  = 0.65           # top 65 % = back of bus
SCALE_UP   = 2.0

# COCO keypoint indices for the head region
HEAD_KPS   = [0, 1, 2, 3, 4]   # nose, l_eye, r_eye, l_ear, r_ear
KP_CONF    = 0.25               # minimum keypoint confidence to count as "head visible"


def clahe_enhance(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    cl = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([cl, a, b]), cv2.COLOR_LAB2BGR)


def nms(boxes: list, scores: list, iou_thr: float = 0.40) -> list:
    if not boxes:
        return []
    b = np.array(boxes, dtype=float)
    s = np.array(scores, dtype=float)
    x1, y1, x2, y2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = s.argsort()[::-1]
    keep  = []
    while order.size:
        i = order[0]
        keep.append(i)
        xx1   = np.maximum(x1[i], x1[order[1:]])
        yy1   = np.maximum(y1[i], y1[order[1:]])
        xx2   = np.minimum(x2[i], x2[order[1:]])
        yy2   = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou   = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        order = order[1:][iou < iou_thr]
    return keep


def run_pose(img_proc: np.ndarray, scale: float) -> tuple[list, list, list]:
    """Run pose model on one region; return (boxes, scores, head_points)."""
    boxes, scores, heads = [], [], []
    result = MODEL(img_proc, verbose=False, conf=CONF, imgsz=IMGSZ)[0]

    for idx, box in enumerate(result.boxes):
        x1, y1, x2, y2 = [v / scale for v in box.xyxy[0].tolist()]
        conf = float(box.conf[0])

        # Find best visible head keypoint
        hx, hy = None, None
        if result.keypoints is not None and idx < len(result.keypoints.data):
            kps = result.keypoints.data[idx]          # shape [17, 3]
            for k in HEAD_KPS:
                if float(kps[k, 2]) > KP_CONF:
                    hx = float(kps[k, 0]) / scale
                    hy = float(kps[k, 1]) / scale
                    break

        boxes.append([x1, y1, x2, y2])
        scores.append(conf)
        heads.append((hx, hy))

    return boxes, scores, heads


def detect(img: np.ndarray):
    """
    Two-pass pose detection:
      Pass 1 — full image.
      Pass 2 — top FAR_RATIO upscaled ×SCALE_UP (back rows).
    Returns list of (x1, y1, x2, y2, conf, head_x, head_y).
    """
    h, w   = img.shape[:2]
    enh    = clahe_enhance(img)
    all_b, all_s, all_h = [], [], []

    # Pass 1 — full frame
    b, s, hd = run_pose(enh, scale=1.0)
    all_b += b; all_s += s; all_h += hd

    # Pass 2 — far/back region upscaled
    far_h  = int(h * FAR_RATIO)
    crop   = enh[:far_h, :]
    up     = cv2.resize(crop, (int(w * SCALE_UP), int(far_h * SCALE_UP)))
    b, s, hd = run_pose(up, scale=SCALE_UP)
    all_b += b; all_s += s; all_h += hd

    kept = nms(all_b, all_s)
    return [(all_b[i][0], all_b[i][1], all_b[i][2], all_b[i][3],
             all_s[i], all_h[i][0], all_h[i][1]) for i in kept]


@app.get("/analyze")
def analyze(response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    global _idx

    if not IMAGES:
        return {"error": "No images found"}

    path  = IMAGES[_idx]
    _idx  = (_idx + 1) % len(IMAGES)

    img = cv2.imread(path)
    if img is None:
        return {"error": f"Cannot read {path}"}

    dets  = detect(img)
    count = len(dets)

    for (x1, y1, x2, y2, conf, hx, hy) in dets:
        ix1, iy1, ix2, iy2 = int(x1), int(y1), int(x2), int(y2)

        # Thin body box for context
        cv2.rectangle(img, (ix1, iy1), (ix2, iy2), BOX_BGR, 1)

        if hx is not None and hy is not None:
            # Prominent filled circle on head
            cx, cy = int(hx), int(hy)
            cv2.circle(img, (cx, cy), 11, HEAD_BGR, -1)
            cv2.circle(img, (cx, cy), 11, (255, 255, 255), 2)
            cv2.putText(img, f"{conf:.2f}", (cx - 12, cy - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
        else:
            # Fallback: standard label on the box
            lbl = f"person {conf:.2f}"
            (lw, lh), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(img, (ix1, iy1 - lh - 6), (ix1 + lw + 4, iy1), BOX_BGR, -1)
            cv2.putText(img, lbl, (ix1 + 2, iy1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)

    _, buf     = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    image_b64  = base64.b64encode(buf).decode()
    pct        = min(100, round(count / CAPACITY * 100))
    status     = "low" if pct < 40 else "medium" if pct < 75 else "high"

    return {
        "count":      count,
        "capacity":   CAPACITY,
        "percentage": pct,
        "status":     status,
        "image_b64":  image_b64,
        "filename":   Path(path).name,
    }


@app.get("/health")
def health():
    return {"ok": True, "images": len(IMAGES)}
