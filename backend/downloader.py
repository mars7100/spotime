"""Download audio from a URL straight into the library (yt-dlp).

This is the one ingest path where bytes *do* pass through the app: yt-dlp writes
to a temp dir on the server, we hand the result to `storage` and `db`, then throw
the temp files away. Uploads stay direct-to-storage (see main.py) — only server-
side downloads work this way, and a song-sized mp3 is small enough to buffer.

Jobs run on a single background worker so two downloads never fight for CPU, and
live in memory: restarting the app forgets them (the *media* they created stays,
since each track is registered the moment it finishes).

Caveats when deployed to Cloud Run: YouTube frequently blocks datacenter IPs
(set SPOTIME_YTDLP_COOKIES to a cookies.txt path to authenticate), and an
instance that scales to zero takes any in-flight job with it.
"""
import os
import shutil
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from . import db, metadata
from .storage import storage
from .stores import new_id, now_iso

# One worker: downloads are CPU-hungry (ffmpeg transcode) and we'd rather run
# them back to back than three at half speed.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ytdl")
_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_MAX_JOBS = 20  # finished jobs kept for the UI to read back

# A playlist download is capped so one bad paste can't fill the library (and, in
# cloud mode, the bill). Overridable for the rare big playlist.
MAX_ENTRIES = int(os.environ.get("SPOTIME_DOWNLOAD_MAX", "50"))

AUDIO_EXTS = {".mp3", ".m4a", ".opus", ".ogg", ".webm", ".aac", ".flac", ".wav"}


def _ydl_opts(dest: Path, progress_hook) -> dict:
    """yt-dlp options: best audio, transcoded to mp3, thumbnail saved alongside."""
    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(dest / "%(id)s.%(ext)s"),
        "noplaylist": True,          # entries are enumerated by us, one at a time
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "writethumbnail": True,
        "progress_hooks": [progress_hook],
        # Node solves YouTube's JS challenges when it's on PATH; without it
        # yt-dlp falls back to its own interpreter.
        "js_runtimes": {"node": {}},
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"},
            {"key": "FFmpegMetadata"},
            # Cover art is stored as covers/<id>.jpg, not embedded — so we only
            # need the thumbnail converted to something mutagen-free code can read.
            {"key": "FFmpegThumbnailsConvertor", "format": "jpg"},
        ],
    }
    cookies = os.environ.get("SPOTIME_YTDLP_COOKIES")
    if cookies:
        opts["cookiefile"] = cookies
    return opts


# ----- job bookkeeping -------------------------------------------------------

def _new_job(url: str, playlist: bool, tags: list[str]) -> dict:
    return {
        "id": new_id(), "url": url, "playlist": playlist, "tags": tags,
        "status": "queued",          # queued | running | done | error
        "message": "Waiting…",
        "progress": 0.0,             # 0..1 for the track currently downloading
        "index": 0, "total": 0,      # position within the playlist
        "added": [], "skipped": [], "failed": [],
        "created_at": now_iso(),
    }


def _update(job_id: str, **fields) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.update(fields)


def _prune() -> None:
    finished = [j for j in _jobs.values() if j["status"] in ("done", "error")]
    for job in sorted(finished, key=lambda j: j["created_at"])[:-_MAX_JOBS]:
        _jobs.pop(job["id"], None)


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def list_jobs() -> list[dict]:
    with _lock:
        return sorted((dict(j) for j in _jobs.values()), key=lambda j: j["created_at"])


def start(url: str, playlist: bool, tags: list[str]) -> dict:
    job = _new_job(url, playlist, tags)
    with _lock:
        _jobs[job["id"]] = job
        _prune()
    _executor.submit(_run, job["id"])
    return dict(job)


# ----- the work --------------------------------------------------------------

def _entries(ydl, url: str, playlist: bool) -> list[dict]:
    """Resolve a URL to the list of videos to fetch, without downloading media.

    `extract_flat` keeps this to one cheap request for a playlist: we only need
    each entry's id/title/url, and the full metadata comes with the download.
    """
    info = ydl.extract_info(url, download=False, process=False)
    if info.get("_type") in ("playlist", "multi_video") and info.get("entries") is not None:
        if not playlist:
            entries = [next(iter(info["entries"]), None)]
        else:
            entries = list(info["entries"])
        entries = [e for e in entries if e]
        for e in entries:
            e["playlist_title"] = info.get("title")
        return entries[:MAX_ENTRIES]
    return [info]


def _known_filenames() -> set[str]:
    """Filenames already in the library, matched the way register() dedups: by
    original_filename (here '<video id>.mp3') among non-book items."""
    return {item["original_filename"] for item in db.list_media()
            if item.get("original_filename") and not item.get("book_id")}


def _entry_url(entry: dict, fallback: str) -> str:
    return entry.get("webpage_url") or entry.get("url") or entry.get("id") or fallback


def _ingest(audio_path: Path, entry: dict, tags: list[str]) -> dict:
    """Move one finished download into storage + the library."""
    media_id = new_id()
    ext = audio_path.suffix.lower()
    key = f"audio/{media_id}{ext}"
    storage.save(key, audio_path.read_bytes())

    # yt-dlp's metadata is better than anything the file carries, but the file is
    # the fallback (and the source of the cover if no thumbnail was written).
    tag_data = metadata.extract(audio_path, audio_path.name)
    cover = _cover_bytes(audio_path) or tag_data.get("cover_bytes")

    artwork_path = None
    if cover:
        artwork_path = f"covers/{media_id}.jpg"
        storage.save(artwork_path, cover)

    return db.create_media(
        id=media_id,
        title=entry.get("title") or tag_data["title"],
        media_type="music",
        artist=entry.get("artist") or entry.get("uploader") or tag_data.get("artist"),
        album=entry.get("album") or entry.get("playlist_title") or tag_data.get("album"),
        duration_seconds=entry.get("duration") or tag_data.get("duration_seconds"),
        storage_path=key,
        artwork_path=artwork_path,
        original_filename=f"{entry.get('id') or audio_path.stem}{ext}",
        tags=tags or None,
    )


def _cover_bytes(audio_path: Path) -> Optional[bytes]:
    """The thumbnail yt-dlp wrote next to the audio, if any."""
    for img in audio_path.parent.glob(f"{audio_path.stem}.*"):
        if img.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            return img.read_bytes()
    return None


def _audio_file(dest: Path) -> Optional[Path]:
    files = [p for p in dest.iterdir() if p.suffix.lower() in AUDIO_EXTS]
    # Prefer the transcoded mp3; fall back to whatever the postprocessor left.
    return next((p for p in files if p.suffix.lower() == ".mp3"), files[0] if files else None)


def _run(job_id: str) -> None:
    import yt_dlp  # imported here so a missing/slow yt-dlp never blocks app start

    job = get_job(job_id)
    if not job:
        return
    _update(job_id, status="running", message="Reading URL…")

    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if total:
                _update(job_id, progress=min(1.0, (d.get("downloaded_bytes") or 0) / total))
        elif d.get("status") == "finished":
            _update(job_id, progress=1.0, message="Converting…")

    tmp_root = Path(tempfile.mkdtemp(prefix="spotime-dl-"))
    try:
        with yt_dlp.YoutubeDL(_ydl_opts(tmp_root, hook)) as probe:
            entries = _entries(probe, job["url"], job["playlist"])
        if not entries:
            _update(job_id, status="error", message="Nothing to download at that URL.")
            return

        _update(job_id, total=len(entries))
        known = _known_filenames()
        for i, entry in enumerate(entries, start=1):
            title = entry.get("title") or entry.get("id") or "track"
            _update(job_id, index=i, progress=0.0, message=f"Downloading {title}…")

            if f"{entry.get('id')}.mp3" in known:
                with _lock:
                    _jobs[job_id]["skipped"].append(title)
                continue

            dest = tmp_root / (entry.get("id") or str(i))
            dest.mkdir(parents=True, exist_ok=True)
            try:
                with yt_dlp.YoutubeDL(_ydl_opts(dest, hook)) as ydl:
                    info = ydl.extract_info(_entry_url(entry, job["url"]), download=True)
                audio = _audio_file(dest)
                if audio is None:
                    raise RuntimeError("no audio file produced")
                # The full info from the real download beats the flat entry.
                merged = {**entry, **{k: v for k, v in info.items() if v is not None}}
                item = _ingest(audio, merged, job["tags"])
                known.add(item["original_filename"])
                with _lock:
                    _jobs[job_id]["added"].append(item["title"])
            except Exception as err:  # one bad video shouldn't sink the playlist
                with _lock:
                    _jobs[job_id]["failed"].append(f"{title}: {err}")
            finally:
                shutil.rmtree(dest, ignore_errors=True)

        job = get_job(job_id) or {}
        _update(job_id, status="done", progress=1.0,
                message=_summary(job))
    except Exception as err:
        _update(job_id, status="error", message=str(err))
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


def _summary(job: dict) -> str:
    parts = [f"Added {len(job.get('added', []))}"]
    if job.get("skipped"):
        parts.append(f"{len(job['skipped'])} already in library")
    if job.get("failed"):
        parts.append(f"{len(job['failed'])} failed")
    return " · ".join(parts)
