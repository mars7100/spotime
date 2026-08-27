"""Firestore store (Phase 2).

Two collections, `media/` and `playback_state/`, keyed by media id — mirroring
the spec's Firestore layout (§13). Search is done client-side: Firestore has no
substring query and a single-user library is small enough to filter in memory.

Auth: uses Application Default Credentials. Locally that means
`gcloud auth application-default login`; on Cloud Run it's the service account.
Project comes from GOOGLE_CLOUD_PROJECT (or ADC's default project).
"""
import os
from typing import Optional

from google.cloud import firestore

from . import new_id, now_iso

MEDIA = "media"
STATE = "playback_state"


class FirestoreStore:
    def __init__(self):
        self._client = None

    @property
    def db(self) -> firestore.Client:
        # Lazily connect so importing the module never requires credentials.
        if self._client is None:
            project = os.environ.get("GOOGLE_CLOUD_PROJECT")
            database = os.environ.get("SPOTIME_FIRESTORE_DATABASE", "(default)")
            self._client = firestore.Client(project=project, database=database)
        return self._client

    def init(self) -> None:
        # Firestore is schemaless; touch the client to fail fast on bad auth.
        _ = self.db

    # ----- media -----
    @staticmethod
    def _with_defaults(doc: Optional[dict]) -> Optional[dict]:
        if doc is not None:
            doc.setdefault("chapters", [])
            doc.setdefault("tags", [])
            for k in ("book_id", "book_title", "track_number"):
                doc.setdefault(k, None)
        return doc

    def create_media(self, *, title, media_type, artist, album, duration_seconds,
                     storage_path, artwork_path, original_filename, id=None,
                     chapters=None, tags=None, book_id=None, book_title=None, track_number=None) -> dict:
        doc = {
            "id": id or new_id(), "title": title, "media_type": media_type, "artist": artist,
            "album": album, "duration_seconds": duration_seconds, "storage_path": storage_path,
            "artwork_path": artwork_path, "original_filename": original_filename,
            "chapters": chapters or [], "tags": tags or [], "book_id": book_id,
            "book_title": book_title, "track_number": track_number, "created_at": now_iso(),
        }
        self.db.collection(MEDIA).document(doc["id"]).set(doc)
        return doc

    def list_media(self, search: Optional[str] = None) -> list[dict]:
        docs = [d.to_dict() for d in self.db.collection(MEDIA).stream()]
        if search:
            q = search.lower()
            docs = [d for d in docs if any(
                q in (d.get(f) or "").lower() for f in ("title", "artist", "album"))]
        docs.sort(key=lambda d: d.get("created_at") or "", reverse=True)
        return [self._with_defaults(d) for d in docs]

    def get_media(self, media_id: str) -> Optional[dict]:
        snap = self.db.collection(MEDIA).document(media_id).get()
        return self._with_defaults(snap.to_dict()) if snap.exists else None

    def update_media_paths(self, media_id: str, storage_path: str,
                           artwork_path: Optional[str]) -> None:
        self.db.collection(MEDIA).document(media_id).update(
            {"storage_path": storage_path, "artwork_path": artwork_path})

    def update_media_tags(self, media_id: str, tags: list[str]) -> Optional[dict]:
        ref = self.db.collection(MEDIA).document(media_id)
        if not ref.get().exists:
            return None
        ref.update({"tags": tags})
        return self.get_media(media_id)

    def delete_media(self, media_id: str) -> bool:
        ref = self.db.collection(MEDIA).document(media_id)
        if not ref.get().exists:
            return False
        ref.delete()
        self.db.collection(STATE).document(media_id).delete()  # cascade
        return True

    # ----- playback state -----
    def get_state(self, media_id: str) -> Optional[dict]:
        snap = self.db.collection(STATE).document(media_id).get()
        return snap.to_dict() if snap.exists else None

    def upsert_state(self, media_id: str, *, position_seconds: float,
                     playback_speed: Optional[float] = None,
                     completed: Optional[bool] = None) -> dict:
        existing = self.get_state(media_id)
        speed = playback_speed if playback_speed is not None else (existing["playback_speed"] if existing else 1.0)
        done = completed if completed is not None else (existing["completed"] if existing else False)
        doc = {
            "media_id": media_id, "position_seconds": position_seconds,
            "playback_speed": speed, "completed": bool(done), "updated_at": now_iso(),
        }
        self.db.collection(STATE).document(media_id).set(doc)
        return doc
