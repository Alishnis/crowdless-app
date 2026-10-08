"""Evaluation protocol: event matching, P/R/F1/accuracy, and the shipped ground truth."""
import glob
import json

import numpy as np

from backend.training.eval_head import TOL_FRAMES, match_events, prf, run_clip


def ev(frame, kind="in"):
    return {"frame": frame, "type": kind}


def test_match_events_exact_and_tolerance_boundary():
    assert match_events([ev(100), ev(200)], [ev(100), ev(200)]) == (2, 0, 0)
    assert match_events([ev(100 + TOL_FRAMES)], [ev(100)]) == (1, 0, 0)       # +-1 s is a hit
    assert match_events([ev(101 + TOL_FRAMES)], [ev(100)]) == (0, 1, 1)       # just outside


def test_match_events_requires_same_direction():
    assert match_events([ev(100, "in")], [ev(100, "out")]) == (0, 1, 1)


def test_match_events_is_one_to_one():
    # two predictions near a single true crossing: one TP, one FP
    assert match_events([ev(98), ev(103)], [ev(100)]) == (1, 1, 0)
    # one prediction near two true crossings: one TP, one FN
    assert match_events([ev(100)], [ev(95), ev(105)]) == (1, 0, 1)


def test_prf_reproduces_the_readme_test_table():
    # Per-clip (TP, FP, FN) printed by `eval_head test` on R5-R8, summed.
    tp, fp, fn = 274, 9, 7
    m = prf(tp, fp, fn)
    assert round(m["precision"], 3) == 0.968
    assert round(m["recall"], 3) == 0.975
    assert round(m["f1"], 3) == 0.972
    assert round(m["accuracy"], 3) == 0.945


def test_prf_empty_scores_zero_not_nan():
    assert prf(0, 0, 0) == {"precision": 0.0, "recall": 0.0, "f1": 0.0, "accuracy": 0.0}


CFG = dict(conf_hi=0.4, conf_lo=0.1, gate=0.7, max_lost=25, n_init=5,
           band=0.03, cooldown=0)


def synthetic_walk(y0, y1, frames=40):
    """A single confident 32px head walking vertically at constant speed."""
    out = []
    for y in np.linspace(y0, y1, frames):
        out.append(np.array([[176.0, y, 32.0, 0.9, 160.0, y - 16, 192.0, y + 16]]))
    return out


def test_run_clip_counts_one_crossing_in_each_direction():
    # 352x288 frame, counting line at mid-height (LINE_RATIO = 0.5)
    down = run_clip(synthetic_walk(60, 230), 352, 288, invert=False, cfg=CFG)
    assert [e["type"] for e in down] == ["in"]
    up = run_clip(synthetic_walk(230, 60), 352, 288, invert=False, cfg=CFG)
    assert [e["type"] for e in up] == ["out"]
    flipped = run_clip(synthetic_walk(60, 230), 352, 288, invert=True, cfg=CFG)
    assert [e["type"] for e in flipped] == ["out"]


def test_run_clip_ignores_flicker_that_never_confirms_a_track():
    # detections on every other frame never reach n_init consecutive hits
    walk = synthetic_walk(60, 230)
    walk = [d if i % 2 == 0 else np.zeros((0, 8)) for i, d in enumerate(walk)]
    assert run_clip(walk, 352, 288, invert=False, cfg=CFG) == []


def test_shipped_benchmarks_are_self_consistent_and_match_readme():
    files = sorted(glob.glob("benchmarks/*.json"))
    assert files, "benchmarks/ is empty"
    pamela_in = 0
    for path in files:
        rec = json.load(open(path, encoding="utf-8"))
        assert rec["in_count"] == sum(e["type"] == "in" for e in rec["events"]), path
        assert rec["out_count"] == sum(e["type"] == "out" for e in rec["events"]), path
        if "_R" in rec["clip"] and rec["clip"].split("_R")[-1][0] in "5678":
            pamela_in += rec["in_count"]
    # README: "270 true entries" on the PAMELA-UANDES test clips R5-R8
    assert pamela_in == 270
