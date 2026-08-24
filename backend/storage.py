"""Storage backend abstraction + selector.

Two backends behind one interface:
  - LocalStorage: bytes on local disk, audio streamed by our Range endpoint.
  - GcsStorage:   bytes in Cloud Storage, audio served via short-lived signed
                  URLs so Cloud Run stays out of the audio path (spec §10).

Chosen by SPOTIME_STORAGE_BACKEND: "local" (default) or "gcs".
"""
import os
from pathlib import Path
from typing import Optional, Protocol

from . import config


class Storage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...
    def delete(self, key: str) -> None: ...
    def read_bytes(self, key: str) -> Optional[bytes]: ...
    def exists(self, key: str) -> bool: ...
    def play_url(self, key: str) -> str: ...
    def upload_url(self, key: str, content_type: str) -> dict: ...
    def local_path(self, key: str) -> Optional[Path]: ...


class LocalStorage:
    """Files live under DATA_DIR; `key` is a path relative to it (e.g. 'audio/<id>.mp3')."""

    def save(self, key: str, data: bytes) -> None:
        dest = self.local_path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    def local_path(self, key: str) -> Path:
        return config.DATA_DIR / key

    def read_bytes(self, key: str) -> Optional[bytes]:
        p = self.local_path(key)
        return p.read_bytes() if p.exists() else None

    def exists(self, key: str) -> bool:
        return self.local_path(key).exists()

    def delete(self, key: str) -> None:
        p = self.local_path(key)
        if p.exists():
            p.unlink()

    def play_url(self, key: str) -> str:
        # Streamed through our own Range-capable endpoint; media id == key stem.
        return f"/api/stream/{Path(key).stem}"

    def upload_url(self, key: str, content_type: str) -> dict:
        # No cloud: the browser PUTs bytes back through our own endpoint.
        return {"url": f"/api/local-upload/{Path(key).name}", "method": "PUT",
                "headers": {"Content-Type": content_type}}


_backend = os.environ.get("SPOTIME_STORAGE_BACKEND", "local").lower()

if _backend == "gcs":
    from .stores.gcs_storage import GcsStorage
    storage: Storage = GcsStorage()
else:
    storage = LocalStorage()

backend_name = _backend
