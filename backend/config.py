"""Runtime configuration.

Phase 1 keeps everything local. Paths can be overridden with env vars so the
same code runs unchanged in a container later.
"""
from pathlib import Path
import os

# Root for all local state. In Phase 1 this holds the SQLite DB and audio files.
DATA_DIR = Path(os.environ.get("SPOTIME_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))

AUDIO_DIR = DATA_DIR / "audio"
COVERS_DIR = DATA_DIR / "covers"
DB_PATH = DATA_DIR / "spotime.db"

_REPO_ROOT = Path(__file__).resolve().parent.parent

# The built React client. Overridable so tests can serve a fixture tree instead.
FRONTEND_DIR = Path(os.environ.get("SPOTIME_FRONTEND_DIR", _REPO_ROOT / "frontend" / "dist"))

# Allowed upload extensions (matches the spec: music + audiobooks).
ALLOWED_EXTENSIONS = {".mp3", ".m4a", ".m4b", ".aac", ".ogg", ".opus", ".flac", ".wav"}


def ensure_dirs() -> None:
    for d in (DATA_DIR, AUDIO_DIR, COVERS_DIR):
        d.mkdir(parents=True, exist_ok=True)
