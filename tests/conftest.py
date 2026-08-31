"""Shared test setup.

`backend.config` resolves DATA_DIR at import time, so the environment has to be
redirected here — at conftest import, before any test module imports the app.
Tests must never touch the real `data/` directory: `make reset` wipes it.
"""
import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="spotime-test-"))
os.environ["SPOTIME_DATA_DIR"] = str(_TMP / "data")
# An unset password leaves the app open, which is what these tests exercise.
os.environ.pop("SPOTIME_PASSWORD", None)

# A stand-in for a built client: an entry HTML plus one content-hashed asset,
# the two halves of the cache policy.
_FRONTEND = _TMP / "frontend"
(_FRONTEND / "assets").mkdir(parents=True)
(_FRONTEND / "index.html").write_text("<!doctype html><title>Spotime</title>")
(_FRONTEND / "assets" / "index-B7xK2p1q.js").write_text("console.log(1)")
(_FRONTEND / "assets" / "logo.svg").write_text("<svg/>")
os.environ["SPOTIME_FRONTEND_DIR"] = str(_FRONTEND)

import pytest
from fastapi.testclient import TestClient


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture(scope="session")
def client():
    from backend.main import app

    with TestClient(app) as c:
        yield c
