"""Hand-annotated ground truth for counting accuracy.

One JSON file per annotated segment under `benchmarks/`. Each records the clip,
the exact stretch that was watched, the counting line it was watched against,
and every entry/exit the annotator marked — with its timestamp, not just a
total, so a later evaluation can ask *when* a method went wrong and not only
*by how much*.

Kept as loose files rather than a database so a benchmark can be reviewed in a
diff and committed alongside the code that is judged by it.
"""
from __future__ import annotations

import json
import os
import re
import time

BENCH_DIR = "benchmarks"


def _slug(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip().lower()
    return re.sub(r"[\s_-]+", "-", text)[:60] or "clip"


def benchmark_id(clip: str, start: float, end: float) -> str:
    return f"{_slug(os.path.splitext(clip)[0])}_{start:.1f}-{end:.1f}"


def path_for(bench_id: str) -> str:
    return os.path.join(BENCH_DIR, f"{bench_id}.json")


def save(record: dict) -> dict:
    """Write one annotation, deriving its id and totals from the events."""
    os.makedirs(BENCH_DIR, exist_ok=True)

    events = sorted(record.get("events", []), key=lambda e: e.get("t", 0))
    record["events"]    = events
    record["in_count"]  = sum(1 for e in events if e.get("type") == "in")
    record["out_count"] = sum(1 for e in events if e.get("type") == "out")
    record["id"]        = benchmark_id(record["clip"],
                                       record["start_seconds"],
                                       record["end_seconds"])
    record.setdefault("created_at", time.time())
    record["updated_at"] = time.time()

    with open(path_for(record["id"]), "w", encoding="utf-8") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    return record


def load(bench_id: str) -> dict | None:
    try:
        with open(path_for(bench_id), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def load_all() -> list[dict]:
    if not os.path.isdir(BENCH_DIR):
        return []
    out = []
    for name in sorted(os.listdir(BENCH_DIR)):
        if not name.endswith(".json"):
            continue
        rec = load(name[:-5])
        if rec:
            out.append(rec)
    return out


def delete(bench_id: str) -> bool:
    try:
        os.unlink(path_for(bench_id))
        return True
    except OSError:
        return False
