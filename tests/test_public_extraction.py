from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_private_runtime_files_are_not_included():
    forbidden = {
        "AGENTS.md",
        "deploy.py",
        "DEPLOY_README.md",
        "trebnik_service",
        "data",
        "static/uploads",
    }
    present = {path.name for path in ROOT.iterdir()}
    assert not (forbidden & present)
    assert not (ROOT / "static" / "uploads").exists()


def test_public_entrypoints_exist():
    assert (ROOT / "server.py").is_file()
    assert (ROOT / "index.html").is_file()
    assert (ROOT / "site_backend" / "settings.py").is_file()
    assert (ROOT / "static" / "app.js").is_file()
