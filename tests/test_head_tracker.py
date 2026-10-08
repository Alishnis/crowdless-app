"""HeadTracker: confirmation, two-stage matching, coasting through occlusion."""
import numpy as np

from backend.counters.method_head import HeadTracker

SIZE = 32.0


def det(x, y, conf=0.9, size=SIZE):
    """One detection row: cx, cy, size, conf, x1, y1, x2, y2."""
    h = size / 2
    return [x, y, size, conf, x - h, y - h, x + h, y + h]


def frame(*rows):
    return np.array(rows, float).reshape(-1, 8)


NONE = np.zeros((0, 8))


def make(**kw):
    cfg = dict(conf_hi=0.5, conf_lo=0.15, gate=1.0, max_lost=5, n_init=3)
    cfg.update(kw)
    return HeadTracker(**cfg)


def test_track_is_only_reported_after_n_init_hits():
    t = make(n_init=3)
    assert t.update(frame(det(100, 100))) == []
    assert t.update(frame(det(102, 100))) == []
    out = t.update(frame(det(104, 100)))
    assert len(out) == 1


def test_low_confidence_head_never_starts_a_track():
    t = make()
    for i in range(10):
        assert t.update(frame(det(100 + 2 * i, 100, conf=0.3))) == []
    assert t.tracks == []


def test_low_confidence_head_continues_an_existing_track():
    t = make()
    for i in range(4):
        out = t.update(frame(det(100 + 2 * i, 100, conf=0.9)))
    tid = out[0].tid
    # Half-hidden head: confidence drops below conf_hi but stays above conf_lo
    for i in range(4, 10):
        out = t.update(frame(det(100 + 2 * i, 100, conf=0.25)))
        assert [o.tid for o in out] == [tid]


def test_track_coasts_through_short_occlusion_keeping_its_id():
    t = make(max_lost=5)
    for i in range(6):
        out = t.update(frame(det(100 + 4 * i, 100)))
    tid = out[0].tid
    for _ in range(3):                      # hidden behind a taller neighbour
        assert t.update(NONE) == []
    out = t.update(frame(det(100 + 4 * 9, 100)))   # reappears where it should be
    assert [o.tid for o in out] == [tid]


def test_track_is_dropped_after_max_lost_and_gets_a_new_id():
    t = make(max_lost=3)
    for i in range(5):
        out = t.update(frame(det(100, 100)))
    tid = out[0].tid
    for _ in range(4):
        t.update(NONE)
    assert t.tracks == []
    for _ in range(3):
        out = t.update(frame(det(100, 100)))
    assert len(out) == 1 and out[0].tid != tid


def test_two_nearby_heads_keep_distinct_stable_ids():
    t = make()
    ids = None
    for i in range(12):
        out = t.update(frame(det(100 + 3 * i, 100), det(150 + 3 * i, 100)))
        if i >= 3:
            now = {round(o.pos[0] / 100): o.tid for o in out}
            assert len(out) == 2 and len(set(now.values())) == 2
            ids = ids or sorted(o.tid for o in out)
            assert sorted(o.tid for o in out) == ids
