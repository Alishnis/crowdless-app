#!/usr/bin/env python3
"""Upload a staged folder (scripts/stage_hf_space.py) to a Hugging Face Space.

Reads HF_TOKEN (fine-grained token with write access) and HF_SPACE_ID
("<user>/<space-name>") from the environment. Creates the Space on first run.
Files already on the Space but absent from the folder are left alone, which is
what keeps the hand-uploaded demo clip in place.

Requires: pip install huggingface_hub
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: upload_hf_space.py STAGED_DIR", file=sys.stderr)
        return 2
    folder = Path(sys.argv[1])
    token = os.environ.get("HF_TOKEN", "")
    space_id = os.environ.get("HF_SPACE_ID", "")
    if not token or not space_id:
        print("HF_TOKEN and HF_SPACE_ID must be set", file=sys.stderr)
        return 2
    if not (folder / "Dockerfile").is_file():
        print(f"{folder} does not look like a staged Space", file=sys.stderr)
        return 2

    from huggingface_hub import HfApi

    api = HfApi(token=token)
    api.create_repo(space_id, repo_type="space", space_sdk="docker", exist_ok=True)
    api.upload_folder(
        folder_path=str(folder),
        repo_id=space_id,
        repo_type="space",
        commit_message="Deploy from GitHub Actions",
    )
    print(f"Uploaded to https://huggingface.co/spaces/{space_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
