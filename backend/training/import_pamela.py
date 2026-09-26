"""Fold the PAMELA-UANDES head-box ground truth into CrowdLess.

PAMELA-UANDES (Velastin et al. 2020, Sensors 20(21):6251 —
https://doi.org/10.3390/s20216251) has 15 videos with every person's head
hand-annotated on every frame, with a persistent id, from the same style of
overhead door camera this project targets. That buys two things:

1. Real head-box training labels — see build_train(). Historically used to
   train method A's whole-body detector (dropped from the app; see git
   history); backend/training/build_head_dataset.py is what method D's own
   head detector actually trains on today.
2. A genuine external benchmark: the *_test* clips' annotated tracks are fed
   through this project's own CountLine/LineCounter — the exact code path a
   live method uses — so the resulting in/out events are ground truth by
   construction, not a hand-eyeballed guess. This replaces the project's
   previous single 5-second, ~5-person benchmark with ~230 real crossings
   across 7 clips. See build_benchmarks().

Expects the dataset already downloaded and extracted under
test_data/pamela-uandes/ (see README "Data" section for the exact files):
    test_data/pamela-uandes/A_d800mm_R*.mpg
    test_data/pamela-uandes/B_No_d800mm_R*.mpg
    test_data/pamela-uandes/GT00/{train,test}/*-Filt.csv

    python -m backend.training.import_pamela
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil

import cv2

from backend import benchmarks
from backend.counters.common import CountLine, Detection, LineCounter

ROOT = "test_data/pamela-uandes"

# The dataset ships train/test CSVs per clip; we keep that split rather than
# inventing our own, so "train" here really is data the ground-truth authors
# never intended for evaluation.
TRAIN_CLIPS = {
    "A_d800mm_R1":    "GT00/train/A_d800mm_R1-Filt.csv",
    "A_d800mm_R2":    "GT00/train/A_d800mm_R2-Filt.csv",
    "A_d800mm_R3":    "GT00/train/A_d800mm_R3-Filt.csv",
    "A_d800mm_R4":    "GT00/train/A_d800mm_R4-Filt.csv",
    "B_No_d800mm_R1": "GT00/train/B_No_d800mm_R1-Filt.csv",
    "B_No_d800mm_R2": "GT00/train/B_No_d800mm_R2-Filt.csv",
    "B_No_d800mm_R3": "GT00/train/B_No_d800mm_R3-Filt.csv",
    "B_No_d800mm_R4": "GT00/train/B_No_d800mm_R4-Filt.csv",
}

# invert mirrors this project's existing STONKAM convention: boarding
# (platform -> vehicle, bottom-to-top in this camera) is "in" with
# invert=True; alighting (vehicle -> platform, top-to-bottom) is "in" with
# invert=False. Confirmed against rendered frames — the vehicle interior is
# always the top of the frame, the lit platform floor the bottom.
TEST_CLIPS = {
    "A_d800mm_R5":    ("GT00/test/A_d800mm_R5-Filt.csv",       False),
    "A_d800mm_R6":    ("GT00/test/A_d800mm_R6-Filt.csv",       False),
    "A_d800mm_R7":    ("GT00/test/A_d800mm_R7-Filt.csv",       False),
    "A_d800mm_R8":    ("GT00/test/A_d800mm_R8-Filt.csv",       False),
    "B_No_d800mm_R5": ("GT00/test/B_No_d800mm_R5-Filt.csv",    True),
    "B_No_d800mm_R6": ("GT00/test/B_No_d800mm_R6-Filt.csv",    True),
    "B_No_d800mm_R7": ("GT00/test/B_No_d800mm_R7-Filt.csv",    True),
}

# Verified empirically (see the accompanying session notes): at ratio 0.5,
# 47-50 of ~50 alight tracks and 26-28 of ~28 board tracks actually span the
# line, so a mid-frame line is not silently missing most of the traffic.
LINE_RATIO = 0.50


def _sample_paths() -> list[str]:
    """Mirrors backend.main._sample_paths — kept local to avoid importing FastAPI."""
    return sorted(glob.glob("test_data/*.mov") + glob.glob("test_data/*.mp4")) + \
           sorted(glob.glob("test_data/quality/*.mp4")) + \
           sorted(glob.glob("test_data/pamela-uandes/*.mpg"))


def _load_csv(path: str) -> dict[int, list[tuple[int, float, float, float, float]]]:
    """frame_number -> [(person_id, top_x, top_y, width, height), ...]"""
    rows: dict[int, list[tuple[int, float, float, float, float]]] = {}
    with open(path) as fh:
        for line in fh:
            parts = line.strip().split(",")
            if len(parts) < 7:
                continue
            frame, pid, _cls, x, y, w, h = parts[:7]
            rows.setdefault(int(frame), []).append(
                (int(pid), float(x), float(y), float(w), float(h)))
    return rows


# ─── (a) training data: real head boxes -> YOLO detection labels ──────────────

def build_train(out_dir: str, every: int, width: int, val_frac: float) -> None:
    root = os.path.abspath(out_dir)
    if os.path.exists(root):
        shutil.rmtree(root)
    for split in ("train", "val"):
        os.makedirs(f"{root}/images/{split}", exist_ok=True)
        os.makedirs(f"{root}/labels/{split}", exist_ok=True)

    stats = {"train": 0, "val": 0, "boxes": 0}
    for tag, csv_rel in TRAIN_CLIPS.items():
        vid = f"{ROOT}/{tag}.mpg"
        csv_path = f"{ROOT}/{csv_rel}"
        if not os.path.exists(vid) or not os.path.exists(csv_path):
            print(f"  !! missing {tag} — skipped")
            continue

        by_frame = _load_csv(csv_path)
        # Split along time, not at random: neighbouring frames are
        # near-identical, so a random split would leak val into train.
        idxs = sorted(by_frame)[::every]
        cut = int(len(idxs) * (1 - val_frac))

        cap = cv2.VideoCapture(vid)
        kept = 0
        for n, fi in enumerate(idxs):
            cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
            ok, frame = cap.read()
            if not ok:
                continue
            h, w = frame.shape[:2]
            rows = []
            for _pid, x, y, bw, bh in by_frame[fi]:
                nw, nh = bw / w, bh / h
                if nw <= 0 or nh <= 0:
                    continue
                cx, cy = (x + bw / 2) / w, (y + bh / 2) / h
                rows.append(f"0 {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")

            split = "train" if n < cut else "val"
            scale = width / w
            small = cv2.resize(frame, (width, int(h * scale)))
            name = f"pamela_{tag}_{fi:06d}"
            cv2.imwrite(f"{root}/images/{split}/{name}.jpg", small,
                        [cv2.IMWRITE_JPEG_QUALITY, 92])
            with open(f"{root}/labels/{split}/{name}.txt", "w") as fh:
                fh.write("\n".join(rows) + ("\n" if rows else ""))

            stats[split] += 1
            stats["boxes"] += len(rows)
            kept += 1
        cap.release()
        print(f"  {tag:16} {len(idxs):4} sampled -> {kept:4} kept")

    with open(f"{root}/data.yaml", "w") as fh:
        fh.write(f"# Auto-generated by backend/training/import_pamela.py\n"
                  f"path: {root}\ntrain: images/train\nval: images/val\n\n"
                  f"names:\n  0: person\n")

    print(f"\ntrain={stats['train']} val={stats['val']} boxes={stats['boxes']}")
    print(f"data.yaml -> {root}/data.yaml")
    print("Combine with the distilled set at train time via a data.yaml whose "
          "train/val lists both this dataset's and datasets/topview_det's paths.")


# ─── (b) real benchmark: true tracks through this project's own line counter ──

def build_benchmarks() -> None:
    paths = _sample_paths()

    for tag, (csv_rel, invert) in TEST_CLIPS.items():
        vid = f"{ROOT}/{tag}.mpg"
        csv_path = f"{ROOT}/{csv_rel}"
        if not os.path.exists(vid) or not os.path.exists(csv_path):
            print(f"  !! missing {tag} — skipped")
            continue

        by_frame = _load_csv(csv_path)
        cap = cv2.VideoCapture(vid)
        fps = cap.get(cv2.CAP_PROP_FPS) or 50.0
        w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        line    = CountLine(ratio=LINE_RATIO, orientation="h", invert=invert)
        counter = LineCounter(line, cooldown=0, min_age=0)
        for fi in sorted(by_frame):
            dets = [Detection(tid=pid, px=x + bw / 2, py=y + bh / 2)
                    for pid, x, y, bw, bh in by_frame[fi]]
            counter.update(dets, w, h, frame_idx=fi)

        clip_name = f"{tag}.mpg"
        match = [i for i, p in enumerate(paths) if os.path.basename(p) == clip_name]
        end_frame = max(by_frame) if by_frame else 0

        rec = {
            "clip":          clip_name,
            "sample_id":     match[0] if match else -1,
            "start_seconds": 0.0,
            "end_seconds":   round((end_frame + 1) / fps, 3),
            "line_ratio":    LINE_RATIO,
            "orientation":   "h",
            "invert":        invert,
            "note": ("PAMELA-UANDES ground truth (Velastin et al. 2020) — real "
                     "head-box tracks replayed through CrowdLess's own "
                     "CountLine/LineCounter, not hand-eyeballed."),
            "events": [{"t": round(e["frame"] / fps, 3), "type": e["type"]}
                       for e in counter.events],
        }
        saved = benchmarks.save(rec)
        print(f"  {tag:16} in={saved['in_count']:3} out={saved['out_count']:3} "
              f"({len(rec['events'])} events over {saved['end_seconds']}s)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="datasets/pamela_det")
    ap.add_argument("--every", type=int, default=5,
                    help="sample every Nth annotated frame (source is 50fps)")
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--val-frac", type=float, default=0.2)
    ap.add_argument("--skip-train", action="store_true")
    ap.add_argument("--skip-benchmarks", action="store_true")
    args = ap.parse_args()

    if not args.skip_train:
        print("── training data (real head boxes -> YOLO labels) ──")
        build_train(args.out, args.every, args.width, args.val_frac)
    if not args.skip_benchmarks:
        print("\n── benchmarks (true tracks -> CountLine/LineCounter events) ──")
        build_benchmarks()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
