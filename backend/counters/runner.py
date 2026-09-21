"""Runs any counting method over a video with identical framing and metrics.

Method-specific code only ever sees a frame and returns detections; the
resizing, the line crossing, the HUD, the annotated mp4 and the timing all live
here, so a comparison between two methods measures the methods and nothing else.
"""
from __future__ import annotations

import os
import tempfile
import time
from dataclasses import dataclass, asdict, field
from typing import Callable

import cv2
import numpy as np

from .common import CountLine, LineCounter, draw_hud, encode_jpeg, is_color_video
from .method_bbox import BBoxMethod
from .method_depth import DepthMethod
from .method_pose import PoseMethod

METHODS = {
    BBoxMethod.id:  BBoxMethod,
    PoseMethod.id:  PoseMethod,
    DepthMethod.id: DepthMethod,
}

# Tunable knobs per method. The UI renders its controls straight from this, so a
# new knob needs no frontend change — and `sanitize_params` below means the
# frontend can never push a value the method would choke on.
PARAMS = {
    BBoxMethod.id: [
        {"key": "point", "label": "Точка подсчёта", "type": "select",
         "default": "bottom",
         "options": [{"value": "bottom", "label": "Низ рамки (ноги)"},
                     {"value": "center", "label": "Центр рамки"}],
         "hint": "Вопреки ожиданиям, низ рамки выигрывает даже на съёмке сверху"},
        {"key": "imgsz", "label": "Разрешение модели", "type": "select",
         "default": 640,
         "options": [{"value": 416, "label": "416 — быстрее"},
                     {"value": 512, "label": "512 — как у дообученной"},
                     {"value": 640, "label": "640 — базовое"},
                     {"value": 960, "label": "960 — мелкие фигуры"}],
         "hint": "Должно совпадать с разрешением обучения весов"},
    ],
    PoseMethod.id: [
        {"key": "kp_conf", "label": "Порог keypoints", "type": "float",
         "default": 0.30, "min": 0.05, "max": 0.80, "step": 0.05,
         "hint": "Ниже порога плечи не считаются найденными и якорь падает на голову"},
        {"key": "imgsz", "label": "Разрешение модели", "type": "select",
         "default": 640,
         "options": [{"value": 416, "label": "416 — быстрее"},
                     {"value": 512, "label": "512 — как у дообученной"},
                     {"value": 640, "label": "640 — базовое"},
                     {"value": 960, "label": "960 — мелкие фигуры"}]},
    ],
    DepthMethod.id: [
        {"key": "min_area_ratio", "label": "Мин. площадь блоба", "type": "float",
         "default": 0.012, "min": 0.001, "max": 0.06, "step": 0.001,
         "hint": "Доля кадра. Больше — отсекает мелкий мусор, но теряет детей"},
        {"key": "diff_thresh", "label": "Порог отличия от фона", "type": "int",
         "default": 30, "min": 5, "max": 90, "step": 1,
         "hint": "Ниже — ловит больше движения и больше шума"},
        {"key": "cut_thresh", "label": "Чувствительность к склейкам", "type": "float",
         "default": 28.0, "min": 5.0, "max": 80.0, "step": 1.0,
         "hint": "Резкая смена кадра сбрасывает модель фона"},
        {"key": "max_aspect", "label": "Макс. вытянутость", "type": "float",
         "default": 4.5, "min": 1.5, "max": 10.0, "step": 0.5,
         "hint": "Отсекает полосы и тени — человек сверху компактен"},
        {"key": "min_extent", "label": "Мин. заполненность", "type": "float",
         "default": 0.30, "min": 0.05, "max": 0.90, "step": 0.05,
         "hint": "Доля площади рамки, занятая блобом"},
        {"key": "colormap", "label": "Псевдо-depth раскраска", "type": "bool",
         "default": True},
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
    "bbox.point":  {"label": "Counting point",
                    "options": {"bottom": "Box bottom (feet)", "center": "Box centre"},
                    "hint": "Against expectations, the box bottom wins even from overhead"},
    "bbox.imgsz":  {"label": "Model resolution",
                    "options": {416: "416 — faster", 512: "512 — matches the fine-tune",
                                640: "640 — baseline", 960: "960 — small figures"},
                    "hint": "Must match the size the weights were trained at"},
    "pose.kp_conf": {"label": "Keypoint threshold",
                     "hint": "Below this the shoulders count as unfound and the anchor drops to the head"},
    "pose.imgsz":  {"label": "Model resolution",
                    "options": {416: "416 — faster", 512: "512 — matches the fine-tune",
                                640: "640 — baseline", 960: "960 — small figures"}},
    "depth.min_area_ratio": {"label": "Min blob area",
                             "hint": "Share of the frame. Higher rejects specks but loses children"},
    "depth.diff_thresh": {"label": "Background difference threshold",
                          "hint": "Lower catches more motion and more noise"},
    "depth.cut_thresh": {"label": "Scene-cut sensitivity",
                         "hint": "A hard cut resets the background model"},
    "depth.max_aspect": {"label": "Max elongation",
                         "hint": "Rejects streaks and shadows — a person from above is compact"},
    "depth.min_extent": {"label": "Min fill ratio",
                         "hint": "Share of the bounding box the blob occupies"},
    "depth.colormap": {"label": "Pseudo-depth colouring"},
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
            "id": BBoxMethod.id, "label": BBoxMethod.label, "name": BBoxMethod.name,
            "title": "Метод A — RGB + YOLO + ByteTrack",
            "desc":  "Обычная камера в салоне. YOLO находит людей, ByteTrack держит ID, "
                     "счёт по пересечению линии нижней точкой рамки.",
            "pros":  ["Работает с любой существующей камерой", "Ничего не надо доустанавливать"],
            "cons":  ["Окклюзия в час пик", "Точность падает в плотной толпе"],
            "datasets": ["COCO (претрейн)", "CrowdHuman (дообучение)", "MOT17/MOT20 (трекер)"],
            "needs_gpu": True,
        },
        {
            "id": PoseMethod.id, "label": PoseMethod.label, "name": PoseMethod.name,
            "title": "Метод B — Top-down + YOLO-Pose",
            "desc":  "Камера над дверью. Считается не рамка, а анатомическая точка — "
                     "середина плеч. В толпе плечи не сливаются, как рамки.",
            "pros":  ["Устойчив к перекрытию тел", "Так работают промышленные APC"],
            "cons":  ["Нужен ракурс сверху", "Тяжелее модель, чем в методе A"],
            "datasets": ["COCO-Pose (претрейн)", "PIROPO (top-view)", "AVSS 2007 (подсчёт на линии)"],
            "needs_gpu": True,
        },
        {
            "id": DepthMethod.id, "label": DepthMethod.label, "name": DepthMethod.name,
            "title": "Метод C — Depth / вычитание фона",
            "desc":  "Без нейросети. Яркость трактуется как карта высот, фон вычитается, "
                     "считаются движущиеся «массы». Так работают ToF-счётчики.",
            "pros":  ["Очень быстро, только CPU", "Не зависит от освещения и одежды"],
            "cons":  ["Не отличает человека от сумки", "Слипание объектов в толпе"],
            "datasets": ["Калибровка на своих записях", "NYU Depth / SUN RGB-D (претрейн сегментации)"],
            "needs_gpu": False,
        },
    ],
    "en": [
        {
            "id": BBoxMethod.id, "label": BBoxMethod.label, "name": BBoxMethod.name,
            "title": "Method A — RGB + YOLO + ByteTrack",
            "desc":  "An ordinary saloon camera. YOLO finds people, ByteTrack keeps their "
                     "ids, and the bottom of each box crossing the line is the count.",
            "pros":  ["Works with any camera already fitted", "Nothing extra to install"],
            "cons":  ["Occlusion at rush hour", "Accuracy drops in a dense crowd"],
            "datasets": ["COCO (pretrain)", "CrowdHuman (fine-tune)", "MOT17/MOT20 (tracker)"],
            "needs_gpu": True,
        },
        {
            "id": PoseMethod.id, "label": PoseMethod.label, "name": PoseMethod.name,
            "title": "Method B — Top-down + YOLO-Pose",
            "desc":  "A camera above the door. It counts an anatomical point — the midpoint "
                     "of the shoulders — rather than a box, and shoulders stay apart in a "
                     "crowd where boxes merge.",
            "pros":  ["Holds up when bodies overlap", "How commercial APC systems work"],
            "cons":  ["Needs an overhead view", "Heavier model than method A"],
            "datasets": ["COCO-Pose (pretrain)", "PIROPO (top-view)", "AVSS 2007 (line counting)"],
            "needs_gpu": True,
        },
        {
            "id": DepthMethod.id, "label": DepthMethod.label, "name": DepthMethod.name,
            "title": "Method C — Depth / background subtraction",
            "desc":  "No neural network. Luminance is read as a height map, the background "
                     "is subtracted and the moving masses are counted — the way ToF "
                     "counters work.",
            "pros":  ["Very fast, CPU only", "Unaffected by lighting or clothing"],
            "cons":  ["Cannot tell a person from a bag", "Blobs merge in a crowd"],
            "datasets": ["Calibrated on your own footage", "NYU Depth / SUN RGB-D (segmentation pretrain)"],
            "needs_gpu": False,
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
    method:      str   = "bbox"
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
    # Inference size. Must match what the weights were trained at: running a
    # 512-trained fine-tune at 640 made it emit ~48 boxes/frame instead of ~4.
    imgsz:       int   = 0        # 0 = the method's own default
    # Method A only: "bottom" assumes feet on the floor (side-on camera),
    # "center" suits a camera looking straight down. "" keeps the method default.
    point:       str   = ""
    # Tracker yaml for methods A/B. "" = ultralytics' stock bytetrack.yaml.
    tracker:     str   = ""
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
    """Reasonable defaults for a clip: depth needs a lower threshold on colour video."""
    cfg = RunConfig(method=method)
    if method == "depth" and is_color_video(video_path):
        cfg.conf = 0.35
    return cfg
