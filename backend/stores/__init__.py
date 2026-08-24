"""Persistence backends for spotime.

Each store exposes the same interface (see `db.py`), so the rest of the app is
backend-agnostic. Phase 1 used SQLite; Phase 2 adds Firestore.
"""
import time
import uuid


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
