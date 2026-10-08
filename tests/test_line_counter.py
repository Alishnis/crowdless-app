"""Counting-line logic: dead zone, direction, cooldown, minimum track age."""
from backend.counters.common import CountLine, Detection, LineCounter

W = H = 100  # frame size; a ratio-0.5 horizontal line sits at y=50, dead zone +-3px


def walk(counter, ys, tid=1, x=50.0, start_frame=0):
    """Feed one track visiting the given y positions, one per frame."""
    for i, y in enumerate(ys):
        counter.update([Detection(tid=tid, px=x, py=y)], W, H, frame_idx=start_frame + i)


def make(invert=False, cooldown=0, min_age=0, orientation="h"):
    return LineCounter(CountLine(0.5, orientation, invert, band=0.03),
                       cooldown=cooldown, min_age=min_age)


def test_side_before_after_and_dead_zone():
    line = CountLine(0.5, "h", band=0.03)
    assert line.side(50, 40, W, H) == "a"
    assert line.side(50, 60, W, H) == "b"
    assert line.side(50, 51, W, H) is None      # inside the band


def test_downward_crossing_is_in_and_upward_is_out():
    down = make()
    walk(down, [20, 35, 48, 55, 70, 85])
    assert (down.in_count, down.out_count) == (1, 0)

    up = make()
    walk(up, [85, 70, 55, 48, 35, 20])
    assert (up.in_count, up.out_count) == (0, 1)


def test_invert_swaps_directions():
    c = make(invert=True)
    walk(c, [20, 35, 48, 55, 70, 85])
    assert (c.in_count, c.out_count) == (0, 1)


def test_vertical_line_uses_x_axis():
    c = make(orientation="v")
    for i, x in enumerate([20, 40, 60, 80]):
        c.update([Detection(tid=1, px=x, py=50)], W, H, frame_idx=i)
    assert (c.in_count, c.out_count) == (1, 0)


def test_jitter_inside_dead_zone_is_not_counted():
    c = make()
    walk(c, [30, 49, 52, 48, 51, 49, 52, 30])   # hovers on the line, retreats
    assert (c.in_count, c.out_count) == (0, 0)


def test_cooldown_blocks_immediate_recount_then_allows_it():
    c = make(cooldown=5)
    walk(c, [30, 60])           # IN
    walk(c, [30], start_frame=2)  # straight back: still cooling down
    assert (c.in_count, c.out_count) == (1, 0)
    walk(c, [30] * 6, start_frame=3)   # cooldown expires
    walk(c, [60], start_frame=9)
    assert c.in_count == 2      # re-crossing a->b after the cooldown counts again


def test_min_age_ignores_brand_new_tracks():
    c = make(min_age=3)
    walk(c, [45, 60])           # track age 2 at the crossing
    assert (c.in_count, c.out_count) == (0, 0)


def test_events_and_current_occupancy():
    c = make()
    walk(c, [20, 60], tid=1)
    walk(c, [20, 60], tid=2, start_frame=10)
    walk(c, [60, 20], tid=3, start_frame=20)
    assert [e["type"] for e in c.events] == ["in", "in", "out"]
    assert [e["frame"] for e in c.events] == [1, 11, 21]
    assert c.current == 1
    # occupancy never goes negative
    only_out = make()
    walk(only_out, [60, 20])
    assert only_out.current == 0
