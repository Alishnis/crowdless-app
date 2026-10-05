from fastapi import FastAPI, Response, UploadFile, File, BackgroundTasks, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import asyncio, cv2, base64, glob, json, numpy as np, threading, uuid, os, tempfile, logging, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from .counters.common import CountLine, LineCounter, Detection, encode_jpeg, is_color_video
from .counters.method_head import HeadMethod
from .counters.runner import METHOD_INFO, METHODS, RunConfig, method_info, run
from . import benchmarks
from .bus_cams import BusCameras

logging.getLogger("ultralytics").setLevel(logging.ERROR)

app = FastAPI(title="CrowdLess Door Counter")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Config ───────────────────────────────────────────────────────────────────

LIVE_VIDEOS = sorted(glob.glob("test_data/*.mov") + glob.glob("test_data/*.mp4"))
CAPACITY    = 50
FRAMES_STEP = 8

# Curated starting points per clip — most of these are vendor promo reels whose
# usable doorway footage sits well past a marketing intro. Found by scanning
# each file for frames that actually contain people.
SAMPLE_PRESETS = {
    "Bus Passenger Counting Camera": {
        "start_seconds": 19.0, "max_seconds": 6.0, "line_ratio": 0.50,
        "invert": True, "orientation": "h",
        "note": "Top-down рыбий глаз, люди заходят снизу вверх. Лучший клип для теста.",
        "note_en": "Top-down fisheye; people board moving upward. The best clip to test on.",
    },
    "HPC168": {
        "start_seconds": 96.0, "max_seconds": 16.0, "line_ratio": 0.55,
        "invert": False, "orientation": "h",
        "note": "ИК/ч-б съёмка сверху над дверью.",
        "note_en": "Overhead IR/greyscale doorway footage.",
    },
    "Hikvision": {
        "start_seconds": 14.0, "max_seconds": 12.0, "line_ratio": 0.55,
        "invert": False, "orientation": "h",
        "note": "Реальная съёмка двери в середине рекламного ролика.",
        "note_en": "Genuine doorway footage buried in the middle of a promo reel.",
    },
    "Screen Recording": {
        "start_seconds": 0.0, "max_seconds": 15.0, "line_ratio": 0.55,
        "invert": False, "orientation": "h",
        "note": "Запись экрана — людей нет, полезна как negative-тест.",
        "note_en": "A screencast with no people — useful as a negative test.",
    },
    "A_d800mm": {
        "start_seconds": 0.0, "max_seconds": 15.0, "line_ratio": 0.50,
        "invert": False, "orientation": "h",
        "note": ("PAMELA-UANDES (Velastin et al. 2020): реальная съёмка высадки "
                 "пассажиров с покадровой разметкой — источник benchmarks/."),
        "note_en": ("PAMELA-UANDES (Velastin et al. 2020): genuine alighting "
                    "footage with frame-accurate ground truth — source of the "
                    "benchmarks/ used for evaluation."),
    },
    "B_No_d800mm": {
        "start_seconds": 0.0, "max_seconds": 15.0, "line_ratio": 0.50,
        "invert": True, "orientation": "h",
        "note": ("PAMELA-UANDES (Velastin et al. 2020): реальная съёмка посадки "
                 "пассажиров с покадровой разметкой — источник benchmarks/."),
        "note_en": ("PAMELA-UANDES (Velastin et al. 2020): genuine boarding "
                    "footage with frame-accurate ground truth — source of the "
                    "benchmarks/ used for evaluation."),
    },
}
DEFAULT_PRESET = {
    "start_seconds": 0.0, "max_seconds": 15.0, "line_ratio": 0.55,
    "invert": False, "orientation": "h",
    "note": "Рекламный ролик, реальной съёмки двери мало.",
    "note_en": "A marketing reel with very little real doorway footage.",
}


def _preset_for(path: str) -> dict:
    name = os.path.basename(path)
    for key, preset in SAMPLE_PRESETS.items():
        if key.lower() in name.lower():
            return preset
    return DEFAULT_PRESET


def _sample_paths() -> list[str]:
    return sorted(glob.glob("test_data/*.mov") + glob.glob("test_data/*.mp4")) + \
           sorted(glob.glob("test_data/quality/*.mp4")) + \
           sorted(glob.glob("test_data/pamela-uandes/*.mpg"))


# ─── Job registry ─────────────────────────────────────────────────────────────

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
# One worker: methods then run one at a time, so the fps each reports is a fair
# measurement rather than a figure distorted by contention with its rivals.
_pool = ThreadPoolExecutor(max_workers=1)

_uploads: dict[str, str] = {}   # source_id → temp file path


def _new_job(method: str, source_name: str) -> str:
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id, "method": method, "source": source_name,
            "status": "queued", "in_count": 0, "out_count": 0,
            "current_count": 0, "frames_done": 0, "total_frames": 0,
            "last_image": "", "fps": 0, "seconds": 0,
            "video_path": None, "error": None, "queued_at": time.time(),
        }
    return job_id


def _run_job(job_id: str, video_path: str, cfg: RunConfig, cleanup: bool = False):
    job = _jobs[job_id]
    try:
        job["status"] = "processing"

        def on_progress(p: dict):
            job.update(p)

        result = run(video_path, cfg, on_progress)
        job.update({k: v for k, v in result.items() if k != "config"})
        job["config"] = result["config"]
        job["status"] = "done"
    except Exception as exc:
        job.update({"status": "error", "error": f"{type(exc).__name__}: {exc}"})
    finally:
        if cleanup:
            try:
                os.unlink(video_path)
            except OSError:
                pass


# Method D already ships its own calibrated weights (models/pamela_head.pt) as
# its default — there is no separate "fine-tuned" variant to switch to yet, so
# this stays empty. See backend/training/eval_head.py for how its defaults
# (runs/head_best.json) were chosen, on a dev split the test clips never touch.
FINETUNES: dict = {}


def _parse_params(raw: str) -> dict:
    """Method-specific knobs arrive as JSON; runner.sanitize_params vets them."""
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def finetune_for(method: str) -> dict | None:
    ft = FINETUNES.get(method)
    return ft if ft and os.path.exists(ft["weights"]) else None


def finetune_available() -> bool:
    return any(finetune_for(m) for m in FINETUNES)


def _cfg_from_query(method: str, line_ratio: float, orientation: str, invert: bool,
                    start_seconds: float, max_seconds: float, conf: float,
                    stride: int, proc_width: int, finetuned: bool = False,
                    min_age: int = 0, params: str = "") -> RunConfig:
    weights, imgsz, point = "", 0, ""
    ft = finetune_for(method) if finetuned else None
    if ft:
        weights = ft["weights"]
        imgsz   = ft["imgsz"]
        point   = ft["point"]
        # The calibrated threshold wins over the caller's slider: these two
        # models fail loudly at each other's settings (see FINETUNES above).
        conf    = ft["conf"]
        min_age = min_age or ft["min_age"]
    return RunConfig(
        method=method, line_ratio=line_ratio, orientation=orientation,
        invert=invert, start_seconds=start_seconds, max_seconds=max_seconds,
        conf=conf, stride=stride, proc_width=proc_width, write_video=True,
        weights=weights, imgsz=imgsz, min_age=min_age or 3, point=point,
        extra=_parse_params(params),
    )


# ─── Method / sample discovery ────────────────────────────────────────────────

@app.get("/methods")
def list_methods(lang: str = Query("ru")):
    return {"methods": method_info(lang)}


@app.get("/models")
def list_models(lang: str = Query("ru")):
    """Which weight sets each method can run — fine-tunes appear once trained.

    Empty today: method D's only weights are its own default
    (models/pamela_head.pt), so there is nothing yet to toggle between.
    """
    return {m: [] for m in METHODS}


@app.get("/samples")
def list_samples(lang: str = Query("ru")):
    out = []
    for i, path in enumerate(_sample_paths()):
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            continue
        fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        w      = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h      = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        preset = dict(_preset_for(path))
        # Collapse the note pair into the single field the UI reads.
        if lang == "en" and preset.get("note_en"):
            preset["note"] = preset["note_en"]
        preset.pop("note_en", None)
        out.append({
            "id": i,
            "name": os.path.basename(path),
            "duration": round(frames / max(1.0, fps), 1),
            "resolution": f"{w}x{h}",
            "fps": round(fps, 1),
            "color": is_color_video(path),
            "preset": preset,
        })
    return {"samples": out}


@app.get("/sample/{sample_id}/thumb")
def sample_thumb(sample_id: int, at: float = Query(0.0, ge=0.0)):
    """A single frame from a sample, for previewing where the line should sit."""
    paths = _sample_paths()
    if not 0 <= sample_id < len(paths):
        return {"error": "Sample not found"}
    cap = cv2.VideoCapture(paths[sample_id])
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if at > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(at * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return {"error": "Cannot read frame"}
    scale = 640 / frame.shape[1]
    frame = cv2.resize(frame, (640, int(frame.shape[0] * scale)))
    return {"image_b64": encode_jpeg(frame, 80)}


# ─── Running jobs ─────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks,
                       file: UploadFile = File(...),
                       method: str = Query("auto"),
                       line_ratio: float = Query(0.55, ge=0.05, le=0.95),
                       orientation: str = Query("h"),
                       invert: bool = Query(False),
                       start_seconds: float = Query(0.0, ge=0.0),
                       max_seconds: float = Query(0.0, ge=0.0),
                       conf: float = Query(0.35, ge=0.05, le=0.95),
                       stride: int = Query(1, ge=1, le=10),
                       proc_width: int = Query(640, ge=320, le=1280),
                       finetuned: bool = Query(False),
                       min_age: int = Query(0, ge=0, le=40),
                       params: str = Query("", description="JSON of method-specific params")):
    """Upload a clip and analyse it with one method (or the best guess)."""
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(await file.read())
    tmp.close()

    if method == "auto":
        method = "head"
    if method not in METHODS:
        os.unlink(tmp.name)
        return {"error": f"Unknown method: {method}"}

    job_id = _new_job(method, file.filename or "upload")
    cfg = _cfg_from_query(method, line_ratio, orientation, invert,
                          start_seconds, max_seconds, conf, stride, proc_width,
                          finetuned, min_age, params)
    _pool.submit(_run_job, job_id, tmp.name, cfg, False)
    _uploads[job_id] = tmp.name
    return {"job_id": job_id, "method": method}


@app.post("/compare")
async def compare_upload(file: UploadFile = File(...),
                         methods: str = Query("head"),
                         line_ratio: float = Query(0.55, ge=0.05, le=0.95),
                         orientation: str = Query("h"),
                         invert: bool = Query(False),
                         start_seconds: float = Query(0.0, ge=0.0),
                         max_seconds: float = Query(15.0, ge=0.0),
                         conf: float = Query(0.35, ge=0.05, le=0.95),
                         stride: int = Query(1, ge=1, le=10),
                         proc_width: int = Query(640, ge=320, le=1280),
                         finetuned: bool = Query(False),
                         min_age: int = Query(0, ge=0, le=40),
                         params: str = Query("", description="JSON of method-specific params")):
    """Upload once, run several methods over the identical frames."""
    wanted = [m.strip() for m in methods.split(",") if m.strip() in METHODS]
    if not wanted:
        return {"error": "No valid methods requested"}

    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(await file.read())
    tmp.close()

    jobs = {}
    for m in wanted:
        job_id = _new_job(m, file.filename or "upload")
        cfg = _cfg_from_query(m, line_ratio, orientation, invert,
                              start_seconds, max_seconds, conf, stride, proc_width,
                              finetuned, min_age, params)
        _pool.submit(_run_job, job_id, tmp.name, cfg, False)
        jobs[m] = job_id
    return {"jobs": jobs}


@app.post("/sample/{sample_id}/run")
def run_sample(sample_id: int,
               methods: str = Query("head"),
               line_ratio: float = Query(0.55, ge=0.05, le=0.95),
               orientation: str = Query("h"),
               invert: bool = Query(False),
               start_seconds: float = Query(0.0, ge=0.0),
               max_seconds: float = Query(15.0, ge=0.0),
               conf: float = Query(0.35, ge=0.05, le=0.95),
               stride: int = Query(1, ge=1, le=10),
               proc_width: int = Query(640, ge=320, le=1280),
               finetuned: bool = Query(False),
               min_age: int = Query(0, ge=0, le=40),
               params: str = Query("", description="JSON of method-specific params")):
    """Analyse one of the bundled test_data clips — no upload needed."""
    paths = _sample_paths()
    if not 0 <= sample_id < len(paths):
        return {"error": "Sample not found"}
    wanted = [m.strip() for m in methods.split(",") if m.strip() in METHODS]
    if not wanted:
        return {"error": "No valid methods requested"}

    path = paths[sample_id]
    jobs = {}
    for m in wanted:
        job_id = _new_job(m, os.path.basename(path))
        cfg = _cfg_from_query(m, line_ratio, orientation, invert,
                              start_seconds, max_seconds, conf, stride, proc_width,
                              finetuned, min_age, params)
        _pool.submit(_run_job, job_id, path, cfg, False)
        jobs[m] = job_id
    return {"jobs": jobs}


@app.get("/job/{job_id}")
def get_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}
    return {k: v for k, v in job.items() if k not in ("video_path", "events")}


@app.get("/job/{job_id}/events")
def get_job_events(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}
    return {"events": job.get("events", [])}


@app.get("/job/{job_id}/video")
def download_video(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        return Response("Job not found", status_code=404)
    if job["status"] != "done":
        return Response("Not ready", status_code=202)
    path = job.get("video_path")
    if not path or not os.path.exists(path):
        return Response("Video file missing", status_code=404)
    return FileResponse(path, media_type="video/mp4",
                        filename=f"crowdless_{job['method']}.mp4")


# ─── Live demo counter (unchanged contract for the existing Monitor page) ─────

class DoorCounter:
    """Streams the bundled clips through method D, frame batch by batch."""

    def __init__(self):
        self.cap     = None
        self.vid_idx = 0
        self.method  = None
        self.counter = None
        self.w = self.h = 0

    def _open_video(self) -> bool:
        if self.cap:
            self.cap.release()
        if not LIVE_VIDEOS:
            return False
        path = LIVE_VIDEOS[self.vid_idx % len(LIVE_VIDEOS)]
        self.vid_idx += 1
        self.cap = cv2.VideoCapture(path)
        if not self.cap.isOpened():
            return False

        src_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        src_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        scale = min(1.0, 640 / max(1, src_w))
        self.w, self.h = int(src_w * scale), int(src_h * scale)

        self.method = HeadMethod()
        self.method.prepare(path, self.w, self.h)
        self.counter = LineCounter(CountLine(0.55, "h"), cooldown=12)
        return True

    def _read(self):
        if self.cap is None and not self._open_video():
            return None
        ok, frame = self.cap.read()
        if not ok:
            if not self._open_video():
                return None
            ok, frame = self.cap.read()
            if not ok:
                return None
        return frame

    def step(self) -> dict:
        if not LIVE_VIDEOS:
            return {"error": "No videos in test_data/"}
        vis = None
        for _ in range(FRAMES_STEP):
            frame = self._read()
            if frame is None:
                return {"error": "Cannot read frames"}
            small = cv2.resize(frame, (self.w, self.h))
            dets, vis = self.method.process(small, 0)
            self.counter.update(dets, self.w, self.h)
            self.counter.line.draw(vis)
            self.method.draw(vis, dets, self.counter)

        from .counters.common import draw_hud
        draw_hud(vis, self.counter, "live")
        count = self.counter.current
        pct   = min(100, round(count / CAPACITY * 100))
        return {
            "count": count, "capacity": CAPACITY, "percentage": pct,
            "status": "low" if pct < 40 else "medium" if pct < 75 else "high",
            "in_count": self.counter.in_count,
            "out_count": self.counter.out_count,
            "image_b64": encode_jpeg(vis, 80),
        }


_live      = DoorCounter()
_live_lock = threading.Lock()
_live_pool = ThreadPoolExecutor(max_workers=1)


def _step() -> dict:
    with _live_lock:
        return _live.step()


@app.get("/analyze")
async def analyze(response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"]        = "no-cache"
    return await asyncio.get_event_loop().run_in_executor(_live_pool, _step)


# ─── Per-bus demo cameras (real dataset footage, see bus_cams.py) ─────────────

_cams      = BusCameras()
_cam_pool  = ThreadPoolExecutor(max_workers=1)   # one inference at a time, like /analyze


@app.get("/bus-cam/{slot}")
async def bus_cam(slot: int, response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return await asyncio.get_event_loop().run_in_executor(_cam_pool, _cams.step, slot)



# ─── Ground-truth benchmarks ──────────────────────────────────────────────────

@app.get("/sample/{sample_id}/strip")
def sample_strip(sample_id: int,
                 start: float = Query(0.0, ge=0.0),
                 end: float = Query(10.0, gt=0.0),
                 fps: float = Query(10.0, ge=1.0, le=30.0),
                 width: int = Query(640, ge=240, le=1280),
                 max_frames: int = Query(400, ge=10, le=900)):
    """Decode a segment into a list of JPEG frames the annotator plays locally.

    Streaming the mp4 into a <video> element would be the obvious choice, but it
    puts the annotation tool at the mercy of Range-request handling along the
    way, and a dropped range leaves a black player with no diagnosis. Decoding
    server-side instead makes playback independent of codec and transport, and
    it buys frame-accurate marking: an event lands on a known frame index rather
    than on whatever timestamp the player happened to report.
    """
    paths = _sample_paths()
    if not 0 <= sample_id < len(paths):
        return {"error": "Sample not found"}

    cap = cv2.VideoCapture(paths[sample_id])
    if not cap.isOpened():
        return {"error": "Cannot open clip"}

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    end     = max(end, start + 1.0 / fps)

    step  = max(1, int(round(src_fps / fps)))
    first = int(start * src_fps)
    last  = min(int(end * src_fps), total or int(end * src_fps))
    if last - first > max_frames * step:
        last = first + max_frames * step

    cap.set(cv2.CAP_PROP_POS_FRAMES, first)
    frames: list[str] = []
    idx = first
    while idx < last and len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if (idx - first) % step == 0:
            scale = width / frame.shape[1]
            small = cv2.resize(frame, (width, int(frame.shape[0] * scale)))
            frames.append(encode_jpeg(small, 70))
        idx += 1
    cap.release()

    return {
        "start": round(first / src_fps, 3),
        "fps":   round(src_fps / step, 3),
        "count": len(frames),
        "frames": frames,
    }


@app.get("/benchmarks")
def list_benchmarks():
    records = benchmarks.load_all()
    return {
        "benchmarks": records,
        "totals": {
            "count": len(records),
            "in":    sum(r.get("in_count", 0) for r in records),
            "out":   sum(r.get("out_count", 0) for r in records),
            "seconds": round(sum(r.get("end_seconds", 0) - r.get("start_seconds", 0)
                                 for r in records), 1),
        },
    }


@app.post("/benchmarks")
async def save_benchmark(request: Request):
    """Store one hand-annotated segment. Totals are derived from the events."""
    try:
        body = await request.json()
    except Exception:
        return {"error": "Invalid JSON body"}

    required = ("clip", "sample_id", "start_seconds", "end_seconds")
    missing = [k for k in required if body.get(k) is None]
    if missing:
        return {"error": f"Missing fields: {', '.join(missing)}"}

    events = body.get("events") or []
    if not isinstance(events, list):
        return {"error": "events must be a list"}
    clean = [
        {"t": round(float(e["t"]), 2), "type": e["type"]}
        for e in events
        if isinstance(e, dict) and e.get("type") in ("in", "out") and e.get("t") is not None
    ]

    record = benchmarks.save({
        "clip":          str(body["clip"]),
        "sample_id":     int(body["sample_id"]),
        "start_seconds": round(float(body["start_seconds"]), 2),
        "end_seconds":   round(float(body["end_seconds"]), 2),
        "line_ratio":    float(body.get("line_ratio", 0.55)),
        "orientation":   "v" if str(body.get("orientation", "h")).startswith("v") else "h",
        "invert":        bool(body.get("invert", False)),
        "note":          str(body.get("note", ""))[:400],
        "events":        clean,
    })
    return {"saved": record}


@app.delete("/benchmarks/{bench_id}")
def delete_benchmark(bench_id: str):
    return {"deleted": benchmarks.delete(bench_id)}


@app.get("/health")
def health():
    return {
        "ok": True,
        "live_videos": len(LIVE_VIDEOS),
        "samples": len(_sample_paths()),
        "methods": [m["id"] for m in METHOD_INFO],
    }
