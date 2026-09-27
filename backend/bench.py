"""Run method D over a video and print the numbers.

    python -m backend.bench test_data/quality/*.mp4 --seconds 10
    python -m backend.bench video.mp4 --line 0.5 --save out/
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil
import sys

from backend.counters.runner import METHODS, RunConfig, run


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--methods", default="head")
    ap.add_argument("--start", type=float, default=0.0, help="skip into the clip")
    ap.add_argument("--seconds", type=float, default=10.0, help="0 = whole clip")
    ap.add_argument("--line", type=float, default=0.55)
    ap.add_argument("--orientation", default="h")
    ap.add_argument("--invert", action="store_true")
    ap.add_argument("--stride", type=int, default=1)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--save", default="", help="directory for annotated mp4s")
    args = ap.parse_args()

    paths: list[str] = []
    for pattern in args.videos:
        paths.extend(sorted(glob.glob(pattern)) or [pattern])

    methods = [m.strip() for m in args.methods.split(",") if m.strip()]
    for m in methods:
        if m not in METHODS:
            print(f"Unknown method {m!r}; known: {', '.join(METHODS)}")
            return 2

    if args.save:
        os.makedirs(args.save, exist_ok=True)

    failures = 0
    for path in paths:
        if not os.path.exists(path):
            print(f"!! missing {path}")
            failures += 1
            continue

        print(f"\n=== {os.path.basename(path)} ===")
        print(f"{'method':8} {'in':>4} {'out':>4} {'now':>4} {'frames':>7} {'fps':>7}  {'time':>6}")
        for m in methods:
            cfg = RunConfig(method=m, line_ratio=args.line,
                            orientation=args.orientation, invert=args.invert,
                            stride=args.stride, proc_width=args.width,
                            start_seconds=args.start, max_seconds=args.seconds,
                            write_video=bool(args.save))
            try:
                r = run(path, cfg)
            except Exception as exc:
                print(f"{m:8} ERROR: {type(exc).__name__}: {exc}")
                failures += 1
                continue

            print(f"{m:8} {r['in_count']:>4} {r['out_count']:>4} {r['current_count']:>4} "
                  f"{r['frames_done']:>7} {r['fps']:>7} {r['seconds']:>6}s")

            if args.save and r.get("video_path"):
                stem = os.path.splitext(os.path.basename(path))[0][:40]
                dest = os.path.join(args.save, f"{stem}__{m}.mp4")
                shutil.move(r["video_path"], dest)
                print(f"{'':8} -> {dest}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
