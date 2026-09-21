"""Lazy, process-wide YOLO weight loading.

Weights are cached, but every job gets its own `YOLO` *instance*: ultralytics
keeps ByteTrack state on the model object, so sharing one instance between two
concurrently running jobs would mix their track ids.
"""
from __future__ import annotations

import logging
import os
import threading

logging.getLogger("ultralytics").setLevel(logging.ERROR)
os.environ.setdefault("YOLO_VERBOSE", "False")

_lock = threading.Lock()
_warm: set[str] = set()


def load(weights: str):
    """Return a fresh YOLO instance for `weights` (downloaded once, then cached)."""
    from ultralytics import YOLO

    with _lock:
        model = YOLO(weights)
        _warm.add(weights)
    return model


def is_warm(weights: str) -> bool:
    return weights in _warm
