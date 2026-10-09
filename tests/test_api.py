"""API smoke tests and parameter validation (no model weights or video needed)."""
import pytest
from fastapi.testclient import TestClient

from backend import benchmarks
from backend.counters.runner import PARAMS, sanitize_params
from backend.main import app, cors_origins

client = TestClient(app)


def test_health_reports_method_d():
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["methods"] == ["head"]


def test_methods_expose_the_tracker_parameter_schema_in_both_languages():
    for lang in ("ru", "en"):
        (method,) = client.get("/methods", params={"lang": lang}).json()["methods"]
        assert {p["key"] for p in method["params"]} == {
            "conf_hi", "conf_lo", "gate", "max_lost", "n_init"}
    en = client.get("/methods", params={"lang": "en"}).json()["methods"][0]
    assert en["params"][0]["label"] == "New-head threshold"


def test_sanitize_params_clamps_coerces_and_drops_unknown_keys():
    spec = {p["key"]: p for p in PARAMS["head"]}
    clean = sanitize_params("head", {
        "conf_hi": "5",          # above max -> clamped, string coerced
        "n_init": 0,             # below min -> clamped
        "gate": "not-a-number",  # unparseable -> dropped
        "evil": 1,               # unknown -> dropped
    })
    assert clean == {"conf_hi": spec["conf_hi"]["max"], "n_init": spec["n_init"]["min"]}
    assert sanitize_params("head", None) == {}


def test_unknown_method_and_missing_sample_return_errors():
    assert "error" in client.post("/sample/9999/run").json()
    assert "error" in client.get("/job/does-not-exist").json()


@pytest.fixture
def bench_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(benchmarks, "BENCH_DIR", str(tmp_path))
    return tmp_path


def test_benchmark_roundtrip_derives_totals_from_events(bench_dir):
    body = {"clip": "demo.mp4", "sample_id": 0, "start_seconds": 1, "end_seconds": 9,
            "events": [{"t": 2.0, "type": "in"}, {"t": 3.456, "type": "in"},
                       {"t": 5, "type": "out"}, {"t": 6, "type": "bogus"}]}
    saved = client.post("/benchmarks", json=body).json()["saved"]
    assert (saved["in_count"], saved["out_count"]) == (2, 1)   # bogus event discarded
    listed = client.get("/benchmarks").json()
    assert listed["totals"]["count"] == 1 and listed["totals"]["in"] == 2
    assert client.delete(f"/benchmarks/{saved['id']}").json() == {"deleted": True}
    assert client.get("/benchmarks").json()["totals"]["count"] == 0


def test_benchmark_rejects_missing_fields(bench_dir):
    assert "Missing fields" in client.post("/benchmarks", json={"clip": "x"}).json()["error"]


def test_cors_origins_default_is_open_and_env_list_is_parsed():
    assert cors_origins("") == ["*"]
    assert cors_origins("  ,") == ["*"]
    assert cors_origins("https://a.vercel.app/, http://localhost:5173") == [
        "https://a.vercel.app", "http://localhost:5173"]
