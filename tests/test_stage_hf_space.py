"""The Hugging Face Space staging script (no network, no docker)."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "stage_hf_space.py"
spec = importlib.util.spec_from_file_location("stage_hf_space", SCRIPT)
stage_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage_mod)


def test_stage_builds_a_docker_space_folder(tmp_path, monkeypatch):
    # Pretend the checkout has no live_demo/ (it is git-ignored, so CI has none).
    repo = tmp_path / "repo"
    for d in ("backend", "models", "benchmarks"):
        (repo / d).mkdir(parents=True)
        (repo / d / "x.txt").write_text("x")
    (repo / "backend" / "__pycache__").mkdir()
    (repo / "backend" / "__pycache__" / "m.pyc").write_text("junk")
    src = Path(stage_mod.REPO) / "Dockerfile.backend"
    (repo / "Dockerfile.backend").write_text(src.read_text(encoding="utf-8"))
    monkeypatch.setattr(stage_mod, "REPO", repo)

    out = tmp_path / "out"
    stage_mod.stage(out)

    assert (out / "live_demo" / ".gitkeep").exists()
    assert not (out / "backend" / "__pycache__").exists()
    readme = (out / "README.md").read_text(encoding="utf-8")
    assert readme.startswith("---\n")
    assert "sdk: docker" in readme and "app_port: 8000" in readme
    dockerfile = (out / "Dockerfile").read_text(encoding="utf-8")
    assert "chmod -R a+rwX /app/benchmarks" in dockerfile
    assert dockerfile.index("chmod") < dockerfile.index("CMD ")
