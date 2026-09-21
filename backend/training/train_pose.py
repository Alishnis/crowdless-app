"""Fine-tune yolo11n-pose on the distilled top-view dataset.

The student keeps its COCO-pretrained backbone (there is nowhere near enough
top-view data to learn "person" from scratch) and only adapts to the overhead
viewpoint. Rotation and flip augmentation matter more than usual here: a ceiling
camera can be mounted at any angle, and the dataset is small enough that
augmentation is doing much of the work.

    python -m backend.training.train_pose --epochs 60
"""
from __future__ import annotations

import argparse
import os
import shutil


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="datasets/topview_pose/data.yaml")
    ap.add_argument("--model", default="yolo11n-pose.pt")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--freeze", type=int, default=6,
                    help="freeze the first N layers to protect pretrained features")
    ap.add_argument("--lr0", type=float, default=0.002)
    ap.add_argument("--patience", type=int, default=20)
    ap.add_argument("--out", default="models/topview_pose.pt")
    ap.add_argument("--name", default="topview_pose")
    args = ap.parse_args()

    if not os.path.exists(args.data):
        print(f"!! {args.data} not found — run backend.training.build_dataset first")
        return 1

    import torch
    from ultralytics import YOLO

    device = "mps" if torch.backends.mps.is_available() else \
             "cuda" if torch.cuda.is_available() else "cpu"
    print(f"model={args.model} device={device} epochs={args.epochs}")

    model = YOLO(args.model)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=device,
        freeze=args.freeze,
        lr0=args.lr0,
        patience=args.patience,
        name=args.name,
        exist_ok=True,
        pretrained=True,
        optimizer="AdamW",
        warmup_epochs=3,
        # A doorway camera has no canonical "up", so rotation is a real-world
        # augmentation here rather than a synthetic one.
        degrees=30.0,
        translate=0.15,
        scale=0.5,
        fliplr=0.5,
        flipud=0.2,
        mosaic=1.0,
        close_mosaic=10,
        val=True,
        plots=True,
        verbose=True,
    )

    best = os.path.join(model.trainer.save_dir, "weights", "best.pt")
    if not os.path.exists(best):
        print("!! training produced no best.pt")
        return 1

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    shutil.copy(best, args.out)
    print(f"\nbest weights -> {args.out}")
    print(f"training artefacts -> {model.trainer.save_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
