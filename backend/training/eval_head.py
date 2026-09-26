"""Tune and test method D on PAMELA-UANDES without touching the test set twice.

    python -m backend.training.eval_head sweep      # grid on the R4 dev clips
    python -m backend.training.eval_head test       # best dev config on R5–R8
    python -m backend.training.eval_head trackers   # same detector, stock trackers

Ground truth is built the same way as benchmarks/: every annotated head track
is replayed through this project's own LineCounter (cooldown 0, min age 0) at a
mid-frame horizontal line. Besides count error, crossings are matched to the
ground truth one-to-one within ±1 s and scored the way Velastin et al. (2020,
Table 6) score counting: precision, recall, F1 and accuracy = TP/(TP+FP+FN).

Detections are cached per clip, so a tracker sweep costs seconds, not a re-run
of the network.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import time

import cv2
import numpy as np

from backend.counters.common import CountLine, Detection, LineCounter
from backend.counters.method_head import DEFAULT_WEIGHTS, HeadMethod, HeadTracker
from backend.training.import_pamela import LINE_RATIO, ROOT, TEST_CLIPS, TRAIN_CLIPS, _load_csv

CACHE = "runs/head_cache"
BEST = "runs/head_best.json"
TOL_FRAMES = 25   # ±1 s at 25 fps

DEV = {tag: (csv, tag.startswith("B_")) for tag, csv in TRAIN_CLIPS.items()
       if tag.endswith("_R4")}
TEST = dict(TEST_CLIPS)


# ─── ground truth ─────────────────────────────────────────────────────────────

def _clip_meta(tag: str):
    cap = cv2.VideoCapture(f"{ROOT}/{tag}.mpg")
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return w, h


def ground_truth(tag: str, csv_rel: str, invert: bool):
    by_frame = _load_csv(f"{ROOT}/{csv_rel}")
    w, h = _clip_meta(tag)
    counter = LineCounter(CountLine(LINE_RATIO, "h", invert), cooldown=0, min_age=0)
    for fi in sorted(by_frame):
        counter.update([Detection(tid=p, px=x + bw / 2, py=y + bh / 2)
                        for p, x, y, bw, bh in by_frame[fi]], w, h, frame_idx=fi)
    return counter.events, max(by_frame)


# ─── detections (cached) ──────────────────────────────────────────────────────

def detections(tag: str, last_frame: int, weights: str, imgsz: int) -> list[np.ndarray]:
    stem = os.path.splitext(os.path.basename(weights))[0]
    path = f"{CACHE}/{stem}_{imgsz}_{tag}.npz"
    if os.path.exists(path):
        z = np.load(path)
        rows, idx = z["rows"], z["idx"]
        return [rows[idx == i] for i in range(int(z["n"]))]

    method = HeadMethod(weights=weights, imgsz=imgsz, conf_lo=0.05)
    method.prepare("", 0, 0)
    cap = cv2.VideoCapture(f"{ROOT}/{tag}.mpg")
    out, t0 = [], time.time()
    for _ in range(last_frame + 1):
        ok, frame = cap.read()
        if not ok:
            break
        out.append(method.detect(frame))
    cap.release()
    print(f"    detected {tag}: {len(out)} frames at {len(out) / (time.time() - t0):.0f} fps")
    os.makedirs(CACHE, exist_ok=True)
    idx = np.concatenate([np.full(len(d), i) for i, d in enumerate(out)]) if out else np.zeros(0)
    rows = np.concatenate(out) if out else np.zeros((0, 8))
    np.savez_compressed(path, rows=rows, idx=idx, n=len(out))
    return out


# ─── scoring ──────────────────────────────────────────────────────────────────

def match_events(pred: list[dict], gt: list[dict]) -> tuple[int, int, int]:
    """One-to-one, same direction, within TOL_FRAMES; greedy on time gap."""
    tp = 0
    for kind in ("in", "out"):
        p = sorted(e["frame"] for e in pred if e["type"] == kind)
        g = sorted(e["frame"] for e in gt if e["type"] == kind)
        pairs = sorted((abs(a - b), i, j) for i, a in enumerate(p)
                       for j, b in enumerate(g) if abs(a - b) <= TOL_FRAMES)
        up, ug = set(), set()
        for _, i, j in pairs:
            if i not in up and j not in ug:
                up.add(i); ug.add(j); tp += 1
    return tp, len(pred) - tp, len(gt) - tp


def run_clip(dets: list[np.ndarray], w: int, h: int, invert: bool, cfg: dict) -> list[dict]:
    tracker = HeadTracker(cfg["conf_hi"], cfg["conf_lo"], cfg["gate"],
                          cfg["max_lost"], cfg["n_init"])
    counter = LineCounter(CountLine(LINE_RATIO, "h", invert, band=cfg["band"]),
                          cooldown=cfg["cooldown"], min_age=0)
    for fi, d in enumerate(dets):
        tracks = tracker.update(d)
        counter.update([Detection(tid=t.tid, px=t.pos[0], py=t.pos[1]) for t in tracks],
                       w, h, frame_idx=fi)
    return counter.events


def evaluate(clips: dict, cfg: dict, weights: str, imgsz: int, verbose: bool = False) -> dict:
    tot = {"tp": 0, "fp": 0, "fn": 0, "in_abs": 0, "out_abs": 0, "in_true": 0,
           "out_true": 0, "rows": []}
    for tag, (csv_rel, invert) in clips.items():
        gt, last = ground_truth(tag, csv_rel, invert)
        w, h = _clip_meta(tag)
        pred = run_clip(detections(tag, last, weights, imgsz), w, h, invert, cfg)
        tp, fp, fn = match_events(pred, gt)
        ti = sum(e["type"] == "in" for e in gt);  to = len(gt) - ti
        pi = sum(e["type"] == "in" for e in pred); po = len(pred) - pi
        tot["tp"] += tp; tot["fp"] += fp; tot["fn"] += fn
        tot["in_abs"] += abs(pi - ti); tot["out_abs"] += abs(po - to)
        tot["in_true"] += ti; tot["out_true"] += to
        tot["rows"].append((tag, ti, pi, to, po, tp, fp, fn))
    tp, fp, fn = tot["tp"], tot["fp"], tot["fn"]
    tot["precision"] = tp / max(1, tp + fp)
    tot["recall"]    = tp / max(1, tp + fn)
    tot["f1"]        = 2 * tp / max(1, 2 * tp + fp + fn)
    tot["accuracy"]  = tp / max(1, tp + fp + fn)
    tot["in_mae"]    = tot["in_abs"] / len(clips)
    tot["out_mae"]   = tot["out_abs"] / len(clips)
    if verbose:
        print(f"  {'clip':16} {'IN true':>7} {'IN pred':>7} {'OUT true':>8} {'OUT pred':>8}"
              f" {'TP':>4} {'FP':>4} {'FN':>4}")
        for r in tot["rows"]:
            print(f"  {r[0]:16} {r[1]:7} {r[2]:7} {r[3]:8} {r[4]:8} {r[5]:4} {r[6]:4} {r[7]:4}")
        print(f"  IN MAE {tot['in_mae']:.2f}   OUT MAE {tot['out_mae']:.2f}   "
              f"P {tot['precision']:.3f}  R {tot['recall']:.3f}  F1 {tot['f1']:.3f}  "
              f"acc {tot['accuracy']:.3f}   (true IN total {tot['in_true']})")
    return tot


# ─── commands ─────────────────────────────────────────────────────────────────

GRID = {
    "conf_hi":  [0.4, 0.5, 0.6],
    "conf_lo":  [0.1, 0.2],
    "gate":     [0.7, 1.0, 1.5],
    "max_lost": [10, 25, 50],
    "n_init":   [2, 3, 5],
    "cooldown": [0, 12],
    # Dead zone half-width as a fraction of frame height. Boarding passengers
    # stop right in the doorway, and a head idling on the line must not flip
    # sides with every pixel of jitter.
    "band":     [0.03, 0.06, 0.10],
}


def sweep(weights: str, imgsz: int) -> dict:
    keys = list(GRID)
    results = []
    for values in itertools.product(*GRID.values()):
        cfg = dict(zip(keys, values))
        r = evaluate(DEV, cfg, weights, imgsz)
        # Primary: event F1 (right people, right direction, right moment);
        # tie-break on raw count error, what a dashboard actually shows.
        results.append((r["f1"], -(r["in_abs"] + r["out_abs"]), cfg, r))
    results.sort(key=lambda t: (t[0], t[1]), reverse=True)
    print(f"\n  top configs on dev (R4), {len(results)} tried:")
    for f1, neg_err, cfg, r in results[:8]:
        print(f"   F1 {f1:.3f}  |err| {-neg_err:3}  {cfg}")
    best = results[0][2]
    with open(BEST, "w") as fh:
        json.dump({"weights": weights, "imgsz": imgsz, **best}, fh, indent=2)
    print(f"\n  best -> {BEST}")
    evaluate(DEV, best, weights, imgsz, verbose=True)
    return best


def trackers(weights: str, imgsz: int, clips: dict) -> None:
    """Ablation: the same head detector under ultralytics' stock trackers."""
    from ultralytics import YOLO
    from backend.counters.common import pick_device
    dev = pick_device()
    for trk in ("bytetrack.yaml", "botsort.yaml"):
        tot = {"tp": 0, "fp": 0, "fn": 0, "in_abs": 0, "out_abs": 0}
        for tag, (csv_rel, invert) in clips.items():
            gt, last = ground_truth(tag, csv_rel, invert)
            w, h = _clip_meta(tag)
            model = YOLO(weights)
            counter = LineCounter(CountLine(LINE_RATIO, "h", invert), cooldown=0, min_age=0)
            cap = cv2.VideoCapture(f"{ROOT}/{tag}.mpg")
            for fi in range(last + 1):
                ok, frame = cap.read()
                if not ok:
                    break
                res = model.track(frame, persist=True, imgsz=imgsz, conf=0.1,
                                  tracker=trk, device=dev, verbose=False)[0]
                dets = []
                if res.boxes is not None and res.boxes.id is not None:
                    for (x1, y1, x2, y2), tid in zip(res.boxes.xyxy.cpu().numpy(),
                                                     res.boxes.id.cpu().numpy().astype(int)):
                        dets.append(Detection(tid=int(tid), px=(x1 + x2) / 2, py=(y1 + y2) / 2))
                counter.update(dets, w, h, frame_idx=fi)
            cap.release()
            tp, fp, fn = match_events(counter.events, gt)
            ti = sum(e["type"] == "in" for e in gt)
            pi = counter.in_count
            tot["tp"] += tp; tot["fp"] += fp; tot["fn"] += fn
            tot["in_abs"] += abs(pi - ti)
            tot["out_abs"] += abs(counter.out_count - (len(gt) - ti))
        tp, fp, fn = tot["tp"], tot["fp"], tot["fn"]
        print(f"  {trk:15} IN MAE {tot['in_abs'] / len(clips):.2f}  OUT MAE "
              f"{tot['out_abs'] / len(clips):.2f}  F1 {2 * tp / max(1, 2 * tp + fp + fn):.3f}  "
              f"acc {tp / max(1, tp + fp + fn):.3f}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["sweep", "test", "dev", "trackers"])
    ap.add_argument("--weights", default=DEFAULT_WEIGHTS)
    ap.add_argument("--imgsz", type=int, default=384)
    args = ap.parse_args()

    if args.cmd == "sweep":
        sweep(args.weights, args.imgsz)
    elif args.cmd in ("test", "dev"):
        with open(BEST) as fh:
            best = json.load(fh)
        cfg = {k: best[k] for k in GRID}
        print(f"  config (chosen on dev only): {cfg}")
        evaluate(TEST if args.cmd == "test" else DEV, cfg,
                 best["weights"], best["imgsz"], verbose=True)
    else:
        trackers(args.weights, args.imgsz, TEST)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
