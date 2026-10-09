#!/usr/bin/env python3
"""Stage the backend as a Hugging Face Docker Space.

Builds a self-contained folder that is ready to be pushed to a Space repo:

    <out>/Dockerfile      Dockerfile.backend (+ a writable benchmarks/ dir)
    <out>/README.md       Space front matter (sdk: docker, app_port: 8000)
    <out>/backend/        the FastAPI app
    <out>/models/         fine-tuned head detector
    <out>/benchmarks/     ground-truth annotations
    <out>/live_demo/      demo clip for /analyze (if present locally)

The GitHub README and Dockerfile.backend are never modified.

Usage:  python scripts/stage_hf_space.py [OUT_DIR]      (default: build/hf_space)
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SPACE_README = """\
---
title: CrowdLess
emoji: 🚌
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
---

# CrowdLess backend

FastAPI + OpenCV + Ultralytics YOLO service that counts people entering and
leaving a doorway (head detector + occlusion-aware tracker).

This Space is deployed automatically from GitHub by a CI workflow; do not edit
it here. Source, results and docs: https://github.com/Alishnis/crowdless-app

Interactive API docs: `/docs` - liveness check: `/health`.
"""

# HF Docker Spaces run the container as UID 1000, while WORKDIR /app is created
# by root. backend/benchmarks.py saves annotations into benchmarks/ at runtime,
# so that one directory must be writable.
WRITABLE_FIX = (
    "# Added by scripts/stage_hf_space.py: Spaces run as UID 1000, and\n"
    "# POST /benchmarks writes into benchmarks/.\n"
    "RUN chmod -R a+rwX /app/benchmarks\n\n"
)

DIRS = ("backend", "models", "benchmarks")
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", ".pytest_cache")


def build_dockerfile(source: str) -> str:
    """Insert the writable-dir fix before the final ENV/CMD block."""
    lines = source.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.startswith("ENV "):
            return "".join(lines[:i]) + WRITABLE_FIX + "".join(lines[i:])
    raise SystemExit("Dockerfile.backend has no ENV line; cannot stage the Space")


def stage(out: Path) -> None:
    for name in (*DIRS, "Dockerfile.backend"):
        if not (REPO / name).exists():
            raise SystemExit(f"missing {name} in {REPO}")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    for name in DIRS:
        shutil.copytree(REPO / name, out / name, ignore=IGNORE)

    # live_demo/ is git-ignored (vendor clip, not redistributable via the repo),
    # so it is absent in CI. The Dockerfile still does `COPY live_demo/ ...`,
    # which needs the directory to exist. The clip itself is uploaded to the
    # Space once by hand (docs/DEPLOY.md); the upload never deletes it.
    demo = out / "live_demo"
    demo.mkdir()
    src_demo = REPO / "live_demo"
    if src_demo.is_dir():
        for f in src_demo.iterdir():
            if f.is_file() and f.name != ".DS_Store":
                shutil.copy2(f, demo / f.name)
    if not any(demo.iterdir()):
        (demo / ".gitkeep").write_text("")

    dockerfile = (REPO / "Dockerfile.backend").read_text(encoding="utf-8")
    (out / "Dockerfile").write_text(build_dockerfile(dockerfile), encoding="utf-8")
    (out / "README.md").write_text(SPACE_README, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("out", nargs="?", default=str(REPO / "build" / "hf_space"))
    out = Path(ap.parse_args().out).resolve()
    stage(out)
    files = [p for p in out.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    print(f"Staged {len(files)} files ({size / 1e6:.1f} MB) in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
