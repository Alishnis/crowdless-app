"""Compare baseline vs fine-tuned weights for method A or B.

Two numbers matter, and they are not the same number:

1. Detection density on held-out top-view frames — does the student see people the
   COCO model missed? For method B, whether it also recovers the shoulder pair
   that the anchor is built on.
2. The count the method actually reports on the held-out benchmark, where the
   true answer is known by eye. Better detection only pays off if it survives
   tracking and line crossing, so min_age is swept rather than assumed.

    python -m backend.training.evaluate --method pose
    python -m backend.training.evaluate --method bbox --point center
"""
from __future__ import annotations

import argparse
import os

import cv2

from backend.counters.runner import RunConfig, run

# STONKAM 19.5-24.0s: one continuous scene, ~5-6 people boarding (moving up the
# frame, hence invert). Excluded from the training set on purpose.
BENCH = {
    "path":  "test_data/quality/Bus Passenger Counting Camera.mp4",
    "start": 19.5,
    "seconds": 4.5,
    "line":  0.50,
    "invert": True,
    "truth_in": 5,
}
PROBE_TIMES = (20.0, 20.8, 21.6, 22.4, 23.2, 24.0)
KP_CONF = 0.30

DEFAULTS = {
    "pose": {"baseline": "yolo11n-pose.pt", "finetuned": "models/topview_pose.pt",
             "teacher": "yolo11m-pose.pt"},
    "bbox": {"baseline": "yolov8n.pt",      "finetuned": "models/topview_det.pt",
             "teacher": "yolo11m-pose.pt"},
}


def probe(weights: str, device: str, conf: float, imgsz: int):
    """Detections (and shoulder pairs) per frame on held-out top-view frames."""
    from ultralytics import YOLO
    model = YOLO(weights)

    n_det = n_sh = n_frames = 0
    cap = cv2.VideoCapture(BENCH["path"])
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    for t in PROBE_TIMES:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            continue
        frame = cv2.resize(frame, (640, int(frame.shape[0] * 640 / frame.shape[1])))
        r = model.predict(frame, classes=[0], conf=conf, imgsz=imgsz,
                          device=device, verbose=False)[0]
        n_frames += 1
        if r.boxes is None:
            continue
        n_det += len(r.boxes)
        if r.keypoints is not None and r.keypoints.conf is not None:
            kc = r.keypoints.conf.cpu().numpy()
            if len(kc):
                n_sh += int(((kc[:, 5] > KP_CONF) & (kc[:, 6] > KP_CONF)).sum())
    cap.release()
    f = max(1, n_frames)
    return n_det / f, n_sh / f


def count(method: str, weights: str | None, conf: float, imgsz: int = 0,
          min_age: int = 3, point: str = "") -> dict:
    cfg = RunConfig(method=method, line_ratio=BENCH["line"], invert=BENCH["invert"],
                    start_seconds=BENCH["start"], max_seconds=BENCH["seconds"],
                    conf=conf, write_video=False, min_age=min_age,
                    weights=weights or "", imgsz=imgsz, point=point)
    return run(BENCH["path"], cfg)



# ─── Whole-suite evaluation ───────────────────────────────────────────────────

def _sample_paths() -> list[str]:
    import glob
    return sorted(glob.glob("test_data/*.mov") + glob.glob("test_data/*.mp4")) + \
           sorted(glob.glob("test_data/quality/*.mp4"))


def run_suite(methods: list[str], finetuned: bool, verbose: bool) -> int:
    """Score every method against every hand-annotated segment.

    Reports MAE on the entry count rather than a single clip's hit or miss: with
    one benchmark a method can land on the right number by luck, and the whole
    point of the annotation tool is to make that luck visible.
    """
    from backend import benchmarks
    from backend.main import FINETUNES

    records = benchmarks.load_all()
    if not records:
        print("No benchmarks yet — annotate some segments at /annotate first.")
        return 1

    paths = _sample_paths()
    per_method: dict[str, list[tuple[int, int]]] = {m: [] for m in methods}

    print(f"{len(records)} benchmark segment(s), "
          f"{sum(r['in_count'] for r in records)} true entries, "
          f"fine-tuned={'on' if finetuned else 'off'}\n")

    for rec in records:
        sid = rec["sample_id"]
        if not 0 <= sid < len(paths) or os.path.basename(paths[sid]) != rec["clip"]:
            # The clip list shifted since annotation — match by name instead.
            match = [p for p in paths if os.path.basename(p) == rec["clip"]]
            if not match:
                print(f"!! {rec['id']}: clip {rec['clip']!r} not found, skipping")
                continue
            path = match[0]
        else:
            path = paths[sid]

        truth_in, truth_out = rec["in_count"], rec["out_count"]
        if verbose:
            print(f"{rec['id']}  truth IN={truth_in} OUT={truth_out}"
                  f"{'  · ' + rec['note'] if rec.get('note') else ''}")

        row = []
        for m in methods:
            ft = FINETUNES.get(m) if finetuned else None
            cfg = RunConfig(
                method=m,
                line_ratio=rec["line_ratio"],
                orientation=rec.get("orientation", "h"),
                invert=rec["invert"],
                start_seconds=rec["start_seconds"],
                max_seconds=max(0.1, rec["end_seconds"] - rec["start_seconds"]),
                conf=ft["conf"] if ft else 0.35,
                imgsz=ft["imgsz"] if ft else 0,
                min_age=ft["min_age"] if ft else 3,
                point=ft["point"] if ft else "",
                weights=ft["weights"] if ft else "",
                write_video=False,
            )
            try:
                r = run(path, cfg)
                got_in, got_out = r["in_count"], r["out_count"]
            except Exception as exc:
                print(f"   {m}: ERROR {type(exc).__name__}: {exc}")
                continue
            per_method[m].append((truth_in, got_in))
            row.append(f"{m}={got_in}")
        if verbose and row:
            print("   " + "  ".join(row))

    print(f"\n{'method':8} {'segments':>9} {'MAE(in)':>8} {'bias':>7} {'exact':>7} {'within1':>8}")
    for m in methods:
        pairs = per_method[m]
        if not pairs:
            print(f"{m:8} {'—':>9}")
            continue
        n     = len(pairs)
        errs  = [got - truth for truth, got in pairs]
        mae   = sum(abs(e) for e in errs) / n
        bias  = sum(errs) / n
        exact = sum(1 for e in errs if e == 0) / n * 100
        near  = sum(1 for e in errs if abs(e) <= 1) / n * 100
        print(f"{m:8} {n:>9} {mae:>8.2f} {bias:>+7.2f} {exact:>6.0f}% {near:>7.0f}%")

    print("\nMAE = mean absolute error on entries; bias<0 undercounts, >0 overcounts.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--method", choices=["pose", "bbox"], default="pose")
    ap.add_argument("--weights", default="")
    ap.add_argument("--baseline", default="")
    ap.add_argument("--teacher", default="")
    ap.add_argument("--conf", type=float, default=0.30)
    ap.add_argument("--imgsz", type=int, default=640)
    # The fine-tune is evaluated at the size it was trained at and at its own
    # threshold; comparing it at the baseline's settings measures the mismatch,
    # not the model.
    ap.add_argument("--ft-conf", type=float, default=0.50)
    ap.add_argument("--ft-imgsz", type=int, default=512)
    ap.add_argument("--point", default="", help="method A counting point: bottom|center")
    ap.add_argument("--sweep-min-age", type=int, nargs="+", default=[3, 6, 10, 15])
    ap.add_argument("--suite", action="store_true",
                    help="score every method against every annotated benchmark")
    ap.add_argument("--finetuned", action="store_true",
                    help="with --suite: use the top-view fine-tuned weights")
    ap.add_argument("--quiet", action="store_true", help="with --suite: totals only")
    ap.add_argument("--suite-methods", default="bbox,pose,depth",
                    help="with --suite: which methods to score")
    args = ap.parse_args()

    if args.suite:
        wanted = [m.strip() for m in args.suite_methods.split(",") if m.strip()]
        return run_suite(wanted, args.finetuned, not args.quiet)

    d = DEFAULTS[args.method]
    weights  = args.weights  or d["finetuned"]
    baseline = args.baseline or d["baseline"]
    teacher  = args.teacher  or d["teacher"]

    import torch
    device = "mps" if torch.backends.mps.is_available() else \
             "cuda" if torch.cuda.is_available() else "cpu"

    if not os.path.exists(weights):
        print(f"!! {weights} not found — train it first")
        return 1

    print(f"method={args.method} device={device}  benchmark: STONKAM "
          f"{BENCH['start']}-{BENCH['start'] + BENCH['seconds']}s (held out), "
          f"truth ≈ {BENCH['truth_in']} entering\n")

    print(f"{'weights':26} {'imgsz':>6} {'conf':>5} {'det/frm':>8} {'shoulders/frm':>14}")
    for label, w, sz, cf in (
        (f"baseline {baseline}", baseline, args.imgsz, args.conf),
        ("fine-tuned",           weights,  args.ft_imgsz, args.ft_conf),
        (f"teacher {teacher}",   teacher,  1280, 0.15),
    ):
        det, sh = probe(w, device, cf, sz)
        print(f"{label:26} {sz:>6} {cf:>5} {det:>8.1f} {sh:>14.1f}")

    # A fragmented track is re-counted every time a fresh id crosses the line,
    # so the honest comparison sweeps the knob that suppresses young ids.
    print(f"\nend-to-end (truth IN = {BENCH['truth_in']}"
          f"{', point=' + args.point if args.point else ''})")
    print(f"{'min_age':>8} {'baseline IN':>12} {'fine-tuned IN':>14}")
    for ma in args.sweep_min_age:
        b = count(args.method, None, args.conf, 0, ma, args.point)
        f = count(args.method, weights, args.ft_conf, args.ft_imgsz, ma, args.point)
        print(f"{ma:>8} {b['in_count']:>12} {f['in_count']:>14}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
