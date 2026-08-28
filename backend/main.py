"""Spotime backend — Phase 1 (local disk + SQLite).

Serves the API from the spec plus a Range-capable /api/stream endpoint so the
browser can seek. The frontend is served as static files from the same origin.
"""
import base64
import binascii
import hashlib
import hmac
import mimetypes
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import (FileResponse, JSONResponse, RedirectResponse,
                               Response, StreamingResponse)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import chapters, config, db, downloader, metadata
from .storage import LocalStorage, storage
from .stores import new_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    yield


app = FastAPI(title="Spotime", lifespan=lifespan)


# ----- auth (optional shared-password gate) ----------------------------------
# If SPOTIME_PASSWORD is set, every request needs a valid cookie. Unset (local
# dev) leaves the app open. The cookie holds sha256(password) — unguessable
# without the password, and constant-time compared.
_PASSWORD = os.environ.get("SPOTIME_PASSWORD")
_EXPECTED_TOKEN = hashlib.sha256(_PASSWORD.encode()).hexdigest() if _PASSWORD else None
_AUTH_COOKIE = "spotime_auth"
_PUBLIC_PATHS = {"/login.html", "/api/login"}


@app.middleware("http")
async def require_auth(request: Request, call_next):
    if _EXPECTED_TOKEN is None or request.url.path in _PUBLIC_PATHS:
        return await call_next(request)
    cookie = request.cookies.get(_AUTH_COOKIE, "")
    if hmac.compare_digest(cookie, _EXPECTED_TOKEN):
        return await call_next(request)
    if request.headers.get("accept", "").startswith("text/html"):
        return RedirectResponse("/login.html")
    return JSONResponse({"detail": "unauthorized"}, status_code=401)


@app.middleware("http")
async def revalidate_static(request: Request, call_next):
    # Static assets (frontend files) are served from "/"; tell the browser to
    # revalidate every time so a new deploy is picked up on the next load instead
    # of a stale cached copy sticking around. API responses are unaffected.
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-cache"
    return response


class Login(BaseModel):
    password: str


@app.post("/api/login")
def login(body: Login, request: Request):
    if _EXPECTED_TOKEN is None:
        return {"ok": True}
    token = hashlib.sha256(body.password.encode()).hexdigest()
    if not hmac.compare_digest(token, _EXPECTED_TOKEN):
        raise HTTPException(401, "wrong password")
    resp = JSONResponse({"ok": True})
    resp.set_cookie(_AUTH_COOKIE, _EXPECTED_TOKEN, httponly=True,
                    secure=request.url.scheme == "https", samesite="lax",
                    max_age=60 * 60 * 24 * 30)
    return resp


# ----- request models --------------------------------------------------------

class StateUpdate(BaseModel):
    position_seconds: float
    playback_speed: Optional[float] = None
    completed: Optional[bool] = None


class TagsUpdate(BaseModel):
    tags: list[str]


class BulkTagsUpdate(BaseModel):
    ids: list[str]
    add: list[str] = []
    remove: list[str] = []


# Only audiobooks remember where you were. Music always starts at 0 — a song you
# reopen (or come back to in a later session) plays from the top. Enforced here,
# in the one place both the read and write paths pass through, so no stale music
# position can survive in either store backend.
def _keeps_state(item: dict) -> bool:
    return item.get("media_type") == "audiobook"


def _blank_state(media_id: str) -> dict:
    return {"media_id": media_id, "position_seconds": 0,
            "playback_speed": 1.0, "completed": False}


# ----- library ---------------------------------------------------------------

@app.get("/api/media")
def get_library(search: Optional[str] = None):
    items = db.list_media(search)
    for it in items:
        it["state"] = db.get_state(it["id"]) if _keeps_state(it) else None
    return items


@app.get("/api/media/{media_id}")
def get_item(media_id: str):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    item["state"] = db.get_state(media_id) if _keeps_state(item) else None
    return item


# Upload is a three-step, direct-to-storage flow so bytes never pass through the
# backend (Cloud Run caps request bodies at ~32 MiB — too small for audiobooks):
#   1. POST /api/media/upload-url  -> mint id + a signed PUT URL
#   2. browser PUTs the file straight to GCS (or, locally, to /api/local-upload)
#   3. POST /api/media/register    -> create the DB record with client-extracted metadata
# The browser extracts tags/duration/cover itself (jsmediatags + <audio>).

class UploadUrlReq(BaseModel):
    filename: str
    content_type: str = "application/octet-stream"


class RegisterReq(BaseModel):
    id: str
    filename: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    duration_seconds: Optional[float] = None
    media_type: Optional[str] = None
    cover_base64: Optional[str] = None
    book_id: Optional[str] = None
    book_title: Optional[str] = None
    track_number: Optional[int] = None
    tags: Optional[list[str]] = None


def _ext_or_400(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"unsupported file type: {ext}")
    return ext


@app.post("/api/media/upload-url")
def create_upload_url(req: UploadUrlReq):
    ext = _ext_or_400(req.filename)
    media_id = new_id()
    key = f"audio/{media_id}{ext}"
    info = storage.upload_url(key, req.content_type)
    return {"id": media_id, "key": key, **info}


@app.put("/api/local-upload/{name}")
async def local_upload(name: str, request: Request):
    # Only used by the local backend; the browser PUTs bytes here.
    if not isinstance(storage, LocalStorage):
        raise HTTPException(404, "not found")
    if name != Path(name).name or "/" in name or ".." in name:
        raise HTTPException(400, "bad name")
    _ext_or_400(name)
    storage.save(f"audio/{name}", await request.body())
    return {"ok": True}


@app.post("/api/media/register", status_code=201)
def register_media(req: RegisterReq):
    ext = _ext_or_400(req.filename)
    key = f"audio/{req.id}{ext}"
    if not storage.exists(key):
        raise HTTPException(400, "uploaded file not found in storage")

    # Dedup by original filename, scoped to the book: if this chapter is already
    # registered under the same book (or as a standalone file, when no book), drop
    # the freshly uploaded blob and return the existing record. Scoping by book_id
    # lets two different books each hold a "Chapter 1.mp3".
    for existing in db.list_media():
        if existing.get("original_filename") == req.filename \
                and existing.get("book_id") == req.book_id:
            storage.delete(key)
            return existing

    media_type = req.media_type if req.media_type in ("music", "audiobook") \
        else metadata.guess_media_type(req.filename)
    title = req.title or Path(req.filename).stem

    artwork_path = None
    if req.cover_base64:
        try:
            storage.save(f"covers/{req.id}.jpg", base64.b64decode(req.cover_base64))
            artwork_path = f"covers/{req.id}.jpg"
        except (ValueError, binascii.Error):
            pass  # bad cover data is non-fatal

    # Embedded chapters (single-file audiobooks only). ffprobe reads them straight
    # from the stored file — a local path, or a signed URL it range-fetches without
    # downloading. Book chapters (a folder of per-chapter files) are grouped by
    # book_id instead, so we skip the per-file probe there.
    chapter_list: list = []
    if media_type == "audiobook" and not req.book_id:
        local = storage.local_path(key)
        source = str(local) if local is not None else storage.play_url(key)
        chapter_list = chapters.extract_chapters(source)

    db.create_media(
        id=req.id, title=title, media_type=media_type, artist=req.artist,
        album=req.album, duration_seconds=req.duration_seconds,
        storage_path=key, artwork_path=artwork_path, original_filename=req.filename,
        chapters=chapter_list, book_id=req.book_id, book_title=req.book_title,
        track_number=req.track_number, tags=req.tags,
    )
    return db.get_media(req.id)


# ----- downloads (server-side, yt-dlp) ---------------------------------------
# The mirror image of upload: instead of the browser pushing bytes to storage, the
# server pulls them from a URL. Jobs run in the background (see downloader.py) and
# the client polls for progress; each finished track is registered immediately, so
# a job that dies partway still leaves everything it managed to fetch.

class DownloadReq(BaseModel):
    url: str
    playlist: bool = False
    tags: list[str] = []


@app.post("/api/download", status_code=202)
def start_download(req: DownloadReq):
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "url must start with http:// or https://")
    return downloader.start(url, req.playlist, _normalize_tags(req.tags))


@app.get("/api/download/{job_id}")
def get_download(job_id: str):
    job = downloader.get_job(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job


@app.get("/api/downloads")
def list_downloads():
    return downloader.list_jobs()


@app.delete("/api/media/{media_id}", status_code=204)
def delete_item(media_id: str):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    storage.delete(item["storage_path"])
    if item.get("artwork_path"):
        storage.delete(item["artwork_path"])
    db.delete_media(media_id)
    return Response(status_code=204)


# ----- playback --------------------------------------------------------------

@app.get("/api/media/{media_id}/play")
def get_play_url(media_id: str):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    return {"url": storage.play_url(item["storage_path"])}


@app.get("/api/media/{media_id}/state")
def get_playback_state(media_id: str):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    if not _keeps_state(item):
        return _blank_state(media_id)
    return db.get_state(media_id) or _blank_state(media_id)


@app.put("/api/media/{media_id}/state")
def put_playback_state(media_id: str, update: StateUpdate):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    if not _keeps_state(item):
        return _blank_state(media_id)  # music is stateless; nothing to persist
    return db.upsert_state(media_id, position_seconds=update.position_seconds,
                           playback_speed=update.playback_speed, completed=update.completed)


# Tags are free-form labels for filtering the library. Normalize on write so
# "Gym", " gym " and "gym" collapse to one, keeping first-seen order.
def _normalize_tags(tags: list[str]) -> list[str]:
    seen, out = set(), []
    for t in tags:
        t = (t or "").strip().lower()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


@app.put("/api/media/{media_id}/tags")
def put_tags(media_id: str, update: TagsUpdate):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    return db.update_media_tags(media_id, _normalize_tags(update.tags))


# Bulk add/remove across many tracks in one call, so tagging a big selection is
# one request instead of N. Per track: drop the `remove` set, then append `add`
# (keeping each track's other tags and first-seen order). Missing ids are skipped.
@app.post("/api/media/tags/bulk")
def bulk_tags(update: BulkTagsUpdate):
    add = _normalize_tags(update.add)
    remove = set(_normalize_tags(update.remove))
    updated = 0
    for media_id in update.ids:
        item = db.get_media(media_id)
        if not item:
            continue
        new = [t for t in (item.get("tags") or []) if t not in remove]
        for t in add:
            if t not in new:
                new.append(t)
        db.update_media_tags(media_id, new)
        updated += 1
    return {"updated": updated}


@app.get("/api/media/{media_id}/artwork")
def get_artwork(media_id: str):
    item = db.get_media(media_id)
    if not item or not item.get("artwork_path"):
        raise HTTPException(404, "no artwork")
    data = storage.read_bytes(item["artwork_path"])
    if data is None:
        raise HTTPException(404, "no artwork")
    return Response(content=data, media_type="image/jpeg")


# ----- streaming with HTTP Range support -------------------------------------

_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@app.get("/api/stream/{media_id}")
def stream(media_id: str, request: Request):
    item = db.get_media(media_id)
    if not item:
        raise HTTPException(404, "media not found")
    path = storage.local_path(item["storage_path"])
    if path is None:
        # Non-local backend (GCS): hand the browser a signed URL to fetch directly.
        return RedirectResponse(storage.play_url(item["storage_path"]))
    if not path.exists():
        raise HTTPException(404, "file missing")

    file_size = path.stat().st_size
    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    range_header = request.headers.get("range")

    if range_header is None:
        return FileResponse(path, media_type=content_type)

    m = _RANGE_RE.match(range_header)
    if not m:
        raise HTTPException(416, "invalid range")
    start = int(m.group(1)) if m.group(1) else 0
    end = int(m.group(2)) if m.group(2) else file_size - 1
    end = min(end, file_size - 1)
    if start > end:
        raise HTTPException(416, "range not satisfiable")

    chunk_size = 1024 * 1024

    def iter_file():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(iter_file(), status_code=206, headers=headers, media_type=content_type)


# ----- frontend (mounted last so /api/* wins) --------------------------------

app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
