"""Score every registered counting method against every annotated benchmark.

    python -m backend.training.evaluate --suite
    python -m backend.training.evaluate --suite --suite-methods head --quiet

This used to also carry a baseline-vs-fine-tuned probe for methods A and B
(RGB+YOLO+ByteTrack, top-down pose) — see git history if that comparison is
ever needed again. Those methods were dropped from the running app once
method D (head detector + head tracker) outperformed all three of them on the
dense-queue benchmark; only the suite scorer below survived, because it is
generic over whatever `backend.counters.runner.METHODS` currently registers.
"""
from __future__ import annotations

import argparse
import glob
import os

from backend.counters.runner import METHODS, RunConfig, run


def _sample_paths() -> list[str]:
    return sorted(glob.glob("test_data/*.mov") + glob.glob("test_data/*.mp4")) + \
           sorted(glob.glob("test_data/quality/*.mp4")) + \
           sorted(glob.glob("test_data/pamela-uandes/*.mpg"))


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
                got_in = r["in_count"]
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
    ap.add_argument("--suite", action="store_true", default=True,
                    help="score every method against every annotated benchmark")
    ap.add_argument("--finetuned", action="store_true",
                    help="use each method's fine-tuned weights, where one exists")
    ap.add_argument("--quiet", action="store_true", help="totals only, no per-clip rows")
    ap.add_argument("--suite-methods", default=",".join(METHODS),
                    help="comma-separated method ids to score")
    args = ap.parse_args()

    wanted = [m.strip() for m in args.suite_methods.split(",") if m.strip()]
    return run_suite(wanted, args.finetuned, not args.quiet)


if __name__ == "__main__":
    raise SystemExit(main())
