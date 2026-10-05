"""Side-by-side hook clip: stock YOLO + ByteTrack vs method D on the same footage.

Both sides see the same frames, count against the same line with the same
LineCounter, and are scored against the same PAMELA ground truth — so the clip
shows a difference in the detectors, not in the bookkeeping. Every number on
screen is computed, none is typed in.

    # table of both methods on every benchmark clip (pick a representative one)
    python -m backend.training.make_hook --scan --stock-weights yolov8n.pt

    # render the hook for one clip window
    python -m backend.training.make_hook \\
        --bench benchmarks/a-d800mm-r5_0.0-76.0.json \\
        --start 14 --seconds 14 --stock-weights yolov8n.pt --out out/hook.mp4

The stock side is a COCO person detector, boxes centred, tracked by Ultralytics'
ByteTrack — the "obvious" pipeline from the README's motivation section.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from backend import benchmarks
from backend.counters import models
from backend.counters.common import (CountLine, Detection, LineCounter, draw_trail,
                                     pick_device)
from backend.counters.method_head import HeadMethod
from backend.counters.runner import _make_writer
from backend.training.import_pamela import ROOT

CANVAS_W, CANVAS_H = 1920, 1080
PANEL_W = 840
HEADER_H = 110
GAP = 48

BG        = (16, 18, 22)
FG        = (240, 242, 245)
MUTED     = (140, 148, 160)
RED       = (255, 92, 92)
GREEN     = (74, 222, 128)

FONT_PATHS = ["/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/SFNS.ttf",
              "/Library/Fonts/Arial.ttf"]


def _font(size: int) -> ImageFont.ImageFont:
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


# ─── the two sides ────────────────────────────────────────────────────────────

class StockYolo:
    """COCO person detector + ByteTrack, counting the box centre."""

    def __init__(self, weights: str, conf: float, imgsz: int):
        self.model = models.load(weights)
        self.conf = conf
        self.imgsz = imgsz
        self.device = pick_device()

    def process(self, frame: np.ndarray) -> list[Detection]:
        res = self.model.track(frame, persist=True, classes=[0], conf=self.conf,
                               imgsz=self.imgsz, tracker="bytetrack.yaml",
                               device=self.device, verbose=False)[0]
        if res.boxes is None or res.boxes.id is None:
            return []
        xyxy = res.boxes.xyxy.cpu().numpy()
        ids = res.boxes.id.cpu().numpy().astype(int)
        conf = res.boxes.conf.cpu().numpy()
        return [Detection(tid=int(i), px=(x1 + x2) / 2, py=(y1 + y2) / 2,
                          box=(x1, y1, x2, y2), conf=float(c))
                for (x1, y1, x2, y2), i, c in zip(xyxy, ids, conf)]

    @staticmethod
    def draw(vis: np.ndarray, dets: list[Detection], counter: LineCounter):
        for d in dets:
            draw_trail(vis, counter.history_of(d.tid), counter.color_of(d.tid))
        for d in dets:
            col = counter.color_of(d.tid)
            x1, y1, x2, y2 = (int(v) for v in d.box)
            cv2.rectangle(vis, (x1, y1), (x2, y2), col, 2)
            cv2.circle(vis, (int(d.px), int(d.py)), 3, col, -1)


# ─── compositing ──────────────────────────────────────────────────────────────

def _panel(frame: np.ndarray) -> np.ndarray:
    h = int(frame.shape[0] * PANEL_W / frame.shape[1])
    return cv2.resize(frame, (PANEL_W, h), interpolation=cv2.INTER_CUBIC)


def compose(left: np.ndarray, right: np.ndarray, hud: dict) -> np.ndarray:
    canvas = np.zeros((CANVAS_H, CANVAS_W, 3), np.uint8)
    canvas[:] = BG[::-1]

    left_p, right_p = _panel(left), _panel(right)
    ph = left_p.shape[0]
    x_left = (CANVAS_W - 2 * PANEL_W - GAP) // 2
    x_right = x_left + PANEL_W + GAP
    top = HEADER_H
    canvas[top:top + ph, x_left:x_left + PANEL_W] = left_p
    canvas[top:top + ph, x_right:x_right + PANEL_W] = right_p

    img = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB))
    dr = ImageDraw.Draw(img)
    f_title, f_big, f_mid, f_small = _font(44), _font(88), _font(36), _font(26)

    def centered(text, cx, y, font, fill):
        w = dr.textlength(text, font=font)
        dr.text((cx - w / 2, y), text, font=font, fill=fill)

    cx_l, cx_r = x_left + PANEL_W / 2, x_right + PANEL_W / 2
    centered(hud["left_title"], cx_l, 30, f_title, RED)
    centered(hud["right_title"], cx_r, 30, f_title, GREEN)

    y_counts = top + ph + 6
    centered(f"IN {hud['left_in']}", cx_l, y_counts, f_big, FG)
    centered(f"IN {hud['right_in']}", cx_r, y_counts, f_big, FG)
    centered(f"OUT {hud['left_out']}", cx_l, y_counts + 104, f_mid, MUTED)
    centered(f"OUT {hud['right_out']}", cx_r, y_counts + 104, f_mid, MUTED)

    # Ground truth, centred between the two sides
    centered(f"TRUE  IN {hud['true_in']}  ·  OUT {hud['true_out']}",
             CANVAS_W / 2, y_counts + 166, f_mid, FG)
    centered(hud["footer"], CANVAS_W / 2, CANVAS_H - 46, f_small, MUTED)

    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


# ─── the run ──────────────────────────────────────────────────────────────────

def _truth_counts(events: list[dict], start: float, upto: float) -> tuple[int, int]:
    inside = [e for e in events if start <= e["t"] <= upto]
    return (sum(e["type"] == "in" for e in inside),
            sum(e["type"] == "out" for e in inside))


def run_pair(bench: dict, start: float, seconds: float, stock_weights: str,
             stock_conf: float, stock_imgsz: int, out_path: str | None,
             hold: float, proc_width: int = 640) -> dict:
    clip = os.path.join(ROOT, bench["clip"])
    cap = cv2.VideoCapture(clip)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open {clip}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = min(1.0, proc_width / src_w)
    w, h = int(src_w * scale) // 2 * 2, int(src_h * scale) // 2 * 2

    end = min(bench["end_seconds"], start + seconds) if seconds > 0 else bench["end_seconds"]
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(start * fps))
    n_frames = int((end - start) * fps)

    line = CountLine(bench["line_ratio"], bench["orientation"], bench["invert"])
    stock_counter = LineCounter(line, cooldown=12, min_age=3)
    head_counter = LineCounter(line, cooldown=12, min_age=3)

    stock = StockYolo(stock_weights, stock_conf, stock_imgsz)
    head = HeadMethod()
    head.prepare(clip, w, h)

    writer = tmp_path = None
    if out_path:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        tmp_path = out_path + ".raw.mp4"
        writer, _ = _make_writer(tmp_path, fps, (CANVAS_W, CANVAS_H))
        if writer is None:
            raise RuntimeError("No usable video codec for writing")

    stock_name = os.path.splitext(os.path.basename(stock_weights))[0]
    hud = {
        "left_title": f"Stock {stock_name.replace('yolo', 'YOLO')} + ByteTrack",
        "right_title": "CrowdLess: head detector + tracker",
        "footer": (f"PAMELA-UANDES {os.path.splitext(bench['clip'])[0]} · "
                   f"{start:.0f}–{end:.0f}s · same line, same counter · "
                   f"Velastin et al., 2020"),
    }

    t0, last_frame = time.time(), None
    for i in range(n_frames):
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (w, h))

        s_dets = stock.process(small)
        stock_counter.update(s_dets, w, h, i)
        s_vis = small.copy()
        line.draw(s_vis)
        stock.draw(s_vis, s_dets, stock_counter)

        h_dets, h_vis = head.process(small, i)
        head_counter.update(h_dets, w, h, i)
        line.draw(h_vis)
        head.draw(h_vis, h_dets, head_counter)

        t_in, t_out = _truth_counts(bench["events"], start, start + (i + 1) / fps)
        hud.update(left_in=stock_counter.in_count, left_out=stock_counter.out_count,
                   right_in=head_counter.in_count, right_out=head_counter.out_count,
                   true_in=t_in, true_out=t_out)

        if writer is not None:
            last_frame = compose(s_vis, h_vis, hud)
            writer.write(last_frame)

    cap.release()
    if writer is not None:
        for _ in range(int(hold * fps)):
            writer.write(last_frame)
        writer.release()
        _finalise(tmp_path, out_path)

    t_in, t_out = _truth_counts(bench["events"], start, end)
    return {"clip": bench["clip"], "start": start, "end": end,
            "true_in": t_in, "true_out": t_out,
            "stock_in": stock_counter.in_count, "stock_out": stock_counter.out_count,
            "head_in": head_counter.in_count, "head_out": head_counter.out_count,
            "seconds": round(time.time() - t0, 1)}


def _finalise(raw: str, out: str):
    """Re-encode to a web/editor-friendly H.264 when ffmpeg is around."""
    if shutil.which("ffmpeg"):
        done = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264",
             "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out])
        if done.returncode == 0:
            os.unlink(raw)
            return
    os.replace(raw, out)


# ─── cli ──────────────────────────────────────────────────────────────────────

def _scan(args) -> int:
    rows = []
    for rec in benchmarks.load_all():
        if not os.path.exists(os.path.join(ROOT, rec["clip"])):
            continue
        print(f"… {rec['clip']}", flush=True)
        rows.append(run_pair(rec, rec["start_seconds"], args.scan_seconds,
                             args.stock_weights, args.stock_conf, args.stock_imgsz,
                             None, 0))
    print(f"\n{'clip':22} {'window':>11} {'TRUE in':>8} {'stock in':>9} {'D in':>6}"
          f" {'TRUE out':>9} {'stock out':>10} {'D out':>6}")
    for r in rows:
        print(f"{r['clip']:22} {r['start']:>4.0f}-{r['end']:<5.0f} {r['true_in']:>8}"
              f" {r['stock_in']:>9} {r['head_in']:>6} {r['true_out']:>9}"
              f" {r['stock_out']:>10} {r['head_out']:>6}")
    print("\nPick a clip that is representative, not the single best one — the "
          "video should say which clip it is.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bench", help="benchmarks/*.json for the clip to render")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--seconds", type=float, default=14.0)
    ap.add_argument("--stock-weights", default="yolo11n.pt",
                    help="COCO detector for the left side (auto-downloaded if it is "
                         "not a local path)")
    ap.add_argument("--stock-conf", type=float, default=0.35)
    ap.add_argument("--stock-imgsz", type=int, default=640)
    ap.add_argument("--out", default="out/hook.mp4")
    ap.add_argument("--hold", type=float, default=2.0,
                    help="seconds to freeze on the final counts")
    ap.add_argument("--scan", action="store_true",
                    help="print both methods on every benchmark clip, render nothing")
    ap.add_argument("--scan-seconds", type=float, default=0.0,
                    help="cap the scan window per clip (0 = the whole annotated stretch)")
    args = ap.parse_args()

    if args.scan:
        return _scan(args)
    if not args.bench:
        ap.error("--bench is required unless --scan is given")

    bench = benchmarks.load(os.path.splitext(os.path.basename(args.bench))[0])
    if bench is None:
        print(f"!! cannot read {args.bench}")
        return 2
    r = run_pair(bench, args.start, args.seconds, args.stock_weights,
                 args.stock_conf, args.stock_imgsz, args.out, args.hold)
    print(f"\n{r['clip']} {r['start']:.0f}–{r['end']:.0f}s")
    print(f"  true   IN {r['true_in']:>3}  OUT {r['true_out']:>3}")
    print(f"  stock  IN {r['stock_in']:>3}  OUT {r['stock_out']:>3}")
    print(f"  D      IN {r['head_in']:>3}  OUT {r['head_out']:>3}")
    print(f"  wrote {args.out} in {r['seconds']}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
