"""Runs any counting method over a video with identical framing and metrics.

Method-specific code only ever sees a frame and returns detections; the
resizing, the line crossing, the HUD, the annotated mp4 and the timing all live
here, so a comparison between two methods measures the methods and nothing else.

Only method D (head detector + head tracker) is wired in — see git history for
methods A/B/C (RGB+YOLO+ByteTrack, top-down pose, depth/background blobs),
which were dropped from the running app once D outperformed all three on the
dense-queue benchmark (see counting-methods-findings in project memory).
"""
from __future__ import annotations

import os
import tempfile
import time
from dataclasses import dataclass, asdict, field
from typing import Callable

import cv2
import numpy as np

from .common import CountLine, LineCounter, draw_hud, encode_jpeg
from .method_head import HeadMethod

METHODS = {
    HeadMethod.id: HeadMethod,
}

# Tunable knobs per method. The UI renders its controls straight from this, so a
# new knob needs no frontend change — and `sanitize_params` below means the
# frontend can never push a value the method would choke on.
PARAMS = {
    HeadMethod.id: [
        {"key": "conf_hi", "label": "Порог новой головы", "type": "float",
         "default": 0.40, "min": 0.10, "max": 0.90, "step": 0.05,
         "hint": "Только детекция увереннее порога может начать новый трек"},
        {"key": "conf_lo", "label": "Порог продолжения трека", "type": "float",
         "default": 0.10, "min": 0.05, "max": 0.50, "step": 0.05,
         "hint": "Полускрытая голова может продолжить трек, но не начать новый"},
        {"key": "gate", "label": "Радиус сопоставления", "type": "float",
         "default": 0.7, "min": 0.3, "max": 2.0, "step": 0.1,
         "hint": "В ширинах головы: как далеко голова может сместиться за кадр"},
        {"key": "max_lost", "label": "Память о потерянной голове", "type": "int",
         "default": 25, "min": 0, "max": 100, "step": 1,
         "hint": "Кадров: сколько трек ждёт голову, скрытую толпой"},
        {"key": "n_init", "label": "Подтверждение трека", "type": "int",
         "default": 5, "min": 1, "max": 15, "step": 1,
         "hint": "Кадров подряд, прежде чем голова считается человеком"},
    ],
}


def sanitize_params(method: str, values: dict | None) -> dict:
    """Keep only known keys, coerced to their declared type and clamped to range."""
    if not values:
        return {}
    schema = {p["key"]: p for p in PARAMS.get(method, [])}
    clean: dict = {}
    for key, raw in values.items():
        spec = schema.get(key)
        if spec is None:
            continue
        try:
            if spec["type"] == "bool":
                clean[key] = raw if isinstance(raw, bool) else str(raw).lower() == "true"
            elif spec["type"] == "int":
                clean[key] = max(spec["min"], min(spec["max"], int(raw)))
            elif spec["type"] == "float":
                clean[key] = max(spec["min"], min(spec["max"], float(raw)))
            elif spec["type"] == "select":
                allowed = [o["value"] for o in spec["options"]]
                value = type(allowed[0])(raw)
                if value in allowed:
                    clean[key] = value
        except (TypeError, ValueError):
            continue
    return clean


# English labels for the knobs above, keyed by "<method>.<param>". Only the
# human-facing strings differ — types, ranges and defaults stay in PARAMS.
PARAMS_EN = {
    "head.conf_hi":  {"label": "New-head threshold",
                      "hint": "Only a detection above this may start a new track"},
    "head.conf_lo":  {"label": "Track-continuation threshold",
                      "hint": "A half-hidden head may continue a track but never start one"},
    "head.gate":     {"label": "Match radius",
                      "hint": "In head widths: how far a head may move between frames"},
    "head.max_lost": {"label": "Lost-head memory",
                      "hint": "Frames a track waits for a head hidden by the crowd"},
    "head.n_init":   {"label": "Track confirmation",
                      "hint": "Consecutive frames before a head counts as a person"},
}


def _params_for(method: str, lang: str) -> list[dict]:
    """The knob schema with its labels in the requested language."""
    specs = PARAMS.get(method, [])
    if lang != "en":
        return specs

    out = []
    for spec in specs:
        tr = PARAMS_EN.get(f"{method}.{spec['key']}")
        if not tr:
            out.append(spec)
            continue
        item = dict(spec)
        item["label"] = tr.get("label", spec["label"])
        if "hint" in tr:
            item["hint"] = tr["hint"]
        elif "hint" in item and "hint" not in tr:
            item.pop("hint", None)
        if spec.get("options") and tr.get("options"):
            item["options"] = [
                {"value": o["value"], "label": tr["options"].get(o["value"], o["label"])}
                for o in spec["options"]
            ]
        out.append(item)
    return out


# Method descriptions in both UI languages. The site asks for one via ?lang=,
# so a card's prose and its code stay in the same file rather than drifting
# apart in a frontend dictionary.
METHOD_INFO_I18N = {
    "ru": [
        {
            "id": HeadMethod.id, "label": HeadMethod.label, "name": HeadMethod.name,
            "title": "Метод D — детектор голов + трекер голов",
            "desc":  "Камера над дверью, плотная очередь. Сверху тела в очереди сливаются, "
                     "а головы остаются раздельными: детектор обучен на реальной разметке "
                     "голов PAMELA-UANDES, трекер держит ID через частичное перекрытие.",
            "pros":  ["Работает в плотной очереди (F1 0.97 на тесте PAMELA)",
                      "Лёгкая модель, ~180 кадров/с"],
            "cons":  ["Обучен на одной камере — на другой нужно дообучение",
                      "Нужен ракурс строго сверху"],
            "datasets": ["PAMELA-UANDES (Velastin et al. 2020), клипы R1–R3",
                         "COCO (претрейн YOLO11n)"],
            "needs_gpu": True,
        },
    ],
    "en": [
        {
            "id": HeadMethod.id, "label": HeadMethod.label, "name": HeadMethod.name,
            "title": "Method D — head detector + head tracker",
            "desc":  "A camera above the door and a dense queue. From above the bodies in a "
                     "queue merge but the heads stay apart: the detector is trained on "
                     "PAMELA-UANDES's real head labels, and the tracker holds ids through "
                     "partial occlusion.",
            "pros":  ["Holds up in a dense queue (F1 0.97 on the PAMELA test clips)",
                      "Light model, ~180 fps"],
            "cons":  ["Trained on one camera — another needs fine-tuning",
                      "Needs a straight-down view"],
            "datasets": ["PAMELA-UANDES (Velastin et al. 2020), clips R1–R3",
                         "COCO (YOLO11n pretrain)"],
            "needs_gpu": True,
        },
    ],
}

# Kept as the Russian list so existing callers keep working unchanged.
METHOD_INFO = METHOD_INFO_I18N["ru"]


def method_info(lang: str = "ru") -> list[dict]:
    """Method cards with their tunable-knob schema attached, in one language."""
    entries = METHOD_INFO_I18N.get(lang, METHOD_INFO_I18N["ru"])
    return [{**e, "params": _params_for(e["id"], lang)} for e in entries]


@dataclass
class RunConfig:
    method:      str   = "head"
    line_ratio:  float = 0.55
    orientation: str   = "h"      # "h" | "v"
    invert:      bool  = False
    band:        float = 0.03
    conf:         float = 0.35
    proc_width:   int   = 640
    start_seconds: float = 0.0    # skip into the clip (marketing intros etc.)
    max_seconds:  float = 0.0     # 0 = whole clip
    stride:       int   = 1       # process every Nth frame
    cooldown:    int   = 12
    min_age:     int   = 3
    write_video: bool  = True
    weights:     str   = ""       # override model weights (e.g. a fine-tune)
    # Inference size. Must match what the weights were trained at.
    imgsz:       int   = 0        # 0 = the method's own default
    point:       str   = ""       # unused by method D; kept for RunConfig shape
    tracker:     str   = ""       # unused by method D; kept for RunConfig shape
    # Method-specific knobs, validated against that method's PARAMS schema and
    # handed straight to its constructor. Keeps per-method tuning out of the
    # shared config while still travelling through one code path.
    extra:       dict  = field(default_factory=dict)


def _make_writer(path: str, fps: float, size: tuple[int, int]):
    """Prefer H.264 so the result plays in a browser; fall back to mp4v."""
    for tag in ("avc1", "mp4v"):
        writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*tag), fps, size)
        if writer.isOpened():
            return writer, tag
        writer.release()
    return None, None


def run(video_path: str, cfg: RunConfig,
        on_progress: Callable[[dict], None] | None = None) -> dict:
    """Process `video_path` with the configured method. Returns a result dict."""
    if cfg.method not in METHODS:
        raise ValueError(f"Unknown method: {cfg.method}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    src_w  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    if src_w == 0 or src_h == 0:
        cap.release()
        raise RuntimeError("Video has no readable frames")

    # Uniform working resolution for every method
    scale = min(1.0, cfg.proc_width / src_w)
    w, h  = int(src_w * scale), int(src_h * scale)
    w    -= w % 2
    h    -= h % 2

    start_frame = int(max(0.0, cfg.start_seconds) * fps)
    if total and start_frame >= total:
        start_frame = 0
    span = (total - start_frame) if total else 10 ** 9
    if cfg.max_seconds > 0:
        span = min(span, int(cfg.max_seconds * fps))
    end_frame = start_frame + span
    frames_to_process = max(1, span // max(1, cfg.stride))

    if start_frame:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    # Announce the frame budget before the (sometimes slow) prepare step, so a
    # caller can show a real progress bar instead of an empty 0/0.
    if on_progress:
        on_progress({"phase": "preparing", "frames_done": 0,
                     "total_frames": frames_to_process})

    kwargs = {"conf": cfg.conf}
    if cfg.weights:
        kwargs["weights"] = cfg.weights
    if cfg.imgsz:
        kwargs["imgsz"] = cfg.imgsz
    if cfg.point:
        kwargs["point"] = cfg.point
    if cfg.tracker:
        kwargs["tracker"] = cfg.tracker
    kwargs.update(sanitize_params(cfg.method, cfg.extra))
    method = METHODS[cfg.method](**kwargs)
    method.prepare(video_path, w, h, start_frame=start_frame, end_frame=end_frame)

    if on_progress:
        on_progress({"phase": "running", "frames_done": 0,
                     "total_frames": frames_to_process})

    line    = CountLine(cfg.line_ratio, cfg.orientation, cfg.invert, cfg.band)
    counter = LineCounter(line, cooldown=cfg.cooldown, min_age=cfg.min_age)

    out_path = writer = codec = None
    if cfg.write_video:
        out_path = tempfile.mktemp(suffix=".mp4")
        writer, codec = _make_writer(out_path, fps / max(1, cfg.stride), (w, h))
        if writer is None:
            out_path = None

    t0, processed, read_idx = time.time(), 0, 0
    try:
        while read_idx < span:
            ok, frame = cap.read()
            if not ok:
                break
            read_idx += 1
            if cfg.stride > 1 and (read_idx - 1) % cfg.stride:
                continue

            small = cv2.resize(frame, (w, h))
            dets, vis = method.process(small, processed)
            counter.update(dets, w, h, processed)

            line.draw(vis)
            method.draw(vis, dets, counter)
            elapsed = time.time() - t0
            draw_hud(vis, counter, f"{method.label}:{cfg.method}",
                     processed / elapsed if elapsed > 0.3 else None)

            if writer is not None:
                writer.write(vis)
            processed += 1

            if on_progress and (processed % 15 == 0 or processed == frames_to_process):
                on_progress({
                    "phase":         "running",
                    "frames_done":   processed,
                    "total_frames":  frames_to_process,
                    "in_count":      counter.in_count,
                    "out_count":     counter.out_count,
                    "current_count": counter.current,
                    "tracks":        len(dets),
                    "last_image":    encode_jpeg(vis),
                    "fps":           round(processed / max(1e-6, time.time() - t0), 1),
                })
    finally:
        cap.release()
        if writer is not None:
            writer.release()

    took = time.time() - t0
    return {
        "method":        cfg.method,
        "phase":         "done",
        "scene_cuts":    getattr(method, "cuts", 0),
        "in_count":      counter.in_count,
        "out_count":     counter.out_count,
        "current_count": counter.current,
        "frames_done":   processed,
        "total_frames":  frames_to_process,
        "events":        counter.events,
        "seconds":       round(took, 2),
        "fps":           round(processed / max(1e-6, took), 1),
        "resolution":    f"{w}x{h}",
        "source_res":    f"{src_w}x{src_h}",
        "codec":         codec,
        "video_path":    out_path,
        "config":        asdict(cfg),
    }


for _info in METHOD_INFO:
    _info["params"] = PARAMS.get(_info["id"], [])


def suggest_config(video_path: str, method: str) -> RunConfig:
    """Reasonable defaults for a clip."""
    return RunConfig(method=method)
