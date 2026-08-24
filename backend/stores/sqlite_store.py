"""SQLite store (default, no cloud required)."""
import json
import sqlite3
from contextlib import contextmanager
from typing import Iterator, Optional

from .. import config
from . import new_id, now_iso

SCHEMA = """
CREATE TABLE IF NOT EXISTS media (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    media_type       TEXT NOT NULL,
    artist           TEXT,
    album            TEXT,
    duration_seconds REAL,
    storage_path     TEXT NOT NULL,
    artwork_path     TEXT,
    original_filename TEXT,
    chapters         TEXT,
    book_id          TEXT,
    book_title       TEXT,
    track_number     INTEGER,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playback_state (
    media_id         TEXT PRIMARY KEY,
    position_seconds REAL NOT NULL DEFAULT 0,
    playback_speed   REAL NOT NULL DEFAULT 1.0,
    completed        INTEGER NOT NULL DEFAULT 0,
    updated_at       TEXT NOT NULL,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);
"""


class SqliteStore:
    def init(self) -> None:
        config.ensure_dirs()
        with self._connect() as conn:
            conn.executescript(SCHEMA)
            # Migrate DBs created before newer columns existed.
            cols = {r["name"] for r in conn.execute("PRAGMA table_info(media)")}
            for col, decl in (("chapters", "TEXT"), ("book_id", "TEXT"),
                              ("book_title", "TEXT"), ("track_number", "INTEGER")):
                if col not in cols:
                    conn.execute(f"ALTER TABLE media ADD COLUMN {col} {decl}")

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(config.DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def _row_to_media(row) -> dict:
        d = dict(row)
        d["chapters"] = json.loads(d["chapters"]) if d.get("chapters") else []
        return d

    # ----- media -----
    def create_media(self, *, title, media_type, artist, album, duration_seconds,
                     storage_path, artwork_path, original_filename, id=None,
                     chapters=None, book_id=None, book_title=None, track_number=None) -> dict:
        row = {
            "id": id or new_id(), "title": title, "media_type": media_type, "artist": artist,
            "album": album, "duration_seconds": duration_seconds, "storage_path": storage_path,
            "artwork_path": artwork_path, "original_filename": original_filename,
            "chapters": json.dumps(chapters or []), "book_id": book_id,
            "book_title": book_title, "track_number": track_number, "created_at": now_iso(),
        }
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO media (id, title, media_type, artist, album, duration_seconds,
                                      storage_path, artwork_path, original_filename, chapters,
                                      book_id, book_title, track_number, created_at)
                   VALUES (:id, :title, :media_type, :artist, :album, :duration_seconds,
                           :storage_path, :artwork_path, :original_filename, :chapters,
                           :book_id, :book_title, :track_number, :created_at)""",
                row,
            )
        return self._row_to_media(row)

    def list_media(self, search: Optional[str] = None) -> list[dict]:
        query, params = "SELECT * FROM media", ()
        if search:
            query += " WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?"
            like = f"%{search}%"
            params = (like, like, like)
        query += " ORDER BY created_at DESC"
        with self._connect() as conn:
            return [self._row_to_media(r) for r in conn.execute(query, params).fetchall()]

    def get_media(self, media_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
            return self._row_to_media(row) if row else None

    def update_media_paths(self, media_id: str, storage_path: str,
                           artwork_path: Optional[str]) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE media SET storage_path = ?, artwork_path = ? WHERE id = ?",
                         (storage_path, artwork_path, media_id))

    def delete_media(self, media_id: str) -> bool:
        with self._connect() as conn:
            return conn.execute("DELETE FROM media WHERE id = ?", (media_id,)).rowcount > 0

    # ----- playback state -----
    def get_state(self, media_id: str) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM playback_state WHERE media_id = ?",
                               (media_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            d["completed"] = bool(d["completed"])
            return d

    def upsert_state(self, media_id: str, *, position_seconds: float,
                     playback_speed: Optional[float] = None,
                     completed: Optional[bool] = None) -> dict:
        existing = self.get_state(media_id)
        speed = playback_speed if playback_speed is not None else (existing["playback_speed"] if existing else 1.0)
        done = completed if completed is not None else (existing["completed"] if existing else False)
        row = {
            "media_id": media_id, "position_seconds": position_seconds,
            "playback_speed": speed, "completed": 1 if done else 0, "updated_at": now_iso(),
        }
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO playback_state (media_id, position_seconds, playback_speed, completed, updated_at)
                   VALUES (:media_id, :position_seconds, :playback_speed, :completed, :updated_at)
                   ON CONFLICT(media_id) DO UPDATE SET
                       position_seconds = excluded.position_seconds,
                       playback_speed   = excluded.playback_speed,
                       completed        = excluded.completed,
                       updated_at       = excluded.updated_at""",
                row,
            )
        row["completed"] = done
        return row
