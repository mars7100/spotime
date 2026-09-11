# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Spotime is a personal web audio library (music + audiobooks) whose defining feature is **persistent playback position** — reopen an audiobook and it resumes where you stopped. Music keeps no position at all: every play starts at 0. Enforced server-side in `main.py` (`_keeps_state`), so no store backend can hand back a stale music position.

## Commands

```bash
make dev            # API + Vite dev server (SQLite + local disk) — browse http://localhost:5173
make dev-firestore  # same, Firestore for metadata/state (needs GOOGLE_CLOUD_PROJECT)
make cloud          # same, Firestore + GCS signed URLs (full cloud, mirrors production)
make build          # build the frontend into frontend/dist
make run            # build, then serve everything from uvicorn on :8080 (production-like)
make test           # uv run pytest
make deploy         # gcloud run deploy to Cloud Run (us-central1)
make install        # uv sync + npm install
make reset          # DESTRUCTIVE: rm -rf data/ (wipes local audio + spotime.db)
```

The dev targets run **two** processes under one `trap 'kill 0'`: uvicorn on `:8080` and Vite on
`:5173`. Browse **5173** — Vite proxies `/api` (and `/legacy`) to uvicorn, so the browser sees one
origin exactly as in production, and HMR works. `:8080` alone serves the last build, not your edits.

Python dependencies are managed with **uv** (`uv sync`, `uv run …`), Python ≥3.12.10; frontend
dependencies with **npm** inside `frontend/`.

Tests run with `make test` (pytest). `tests/conftest.py` points `SPOTIME_DATA_DIR` at a temp dir
**at conftest import**, before the app is imported — `backend/config.py` resolves it at import time,
and tests must never touch the real `data/` directory (which `make reset` wipes). External audio
tooling: `ffprobe`/`ffmpeg` must be on PATH for chapter extraction (installed in the Dockerfile
image).

## Architecture

Two orthogonal backend selectors, each a **facade chosen at import time** from an env var and re-exported as module-level functions, so the rest of the app is backend-agnostic:

- **`backend/db.py`** — `SPOTIME_DB_BACKEND` = `sqlite` (default) | `firestore`. Picks `SqliteStore` or `FirestoreStore` from `backend/stores/`, re-exports `create_media`, `get_state`, `upsert_state`, etc. as `db.*` functions.
- **`backend/storage.py`** — `SPOTIME_STORAGE_BACKEND` = `local` (default) | `gcs`. Picks `LocalStorage` (inline) or `GcsStorage` (`backend/stores/gcs_storage.py`) behind the `Storage` Protocol.

These two axes are independent (hence `dev` / `dev-firestore` / `cloud` mix them). **Backends do NOT share data** — switching backends switches to a separate library. To add a persistence method, add it to the store classes *and* re-export it in the facade; to add a storage method, add it to the `Storage` Protocol and both implementations.

**The audio bytes never flow through the app in cloud mode.** `storage.play_url(key)` returns:
- Local: `/api/stream/{id}`, served by the app's own Range-capable endpoint in `main.py`.
- GCS: a short-lived V4 signed URL; the browser fetches bytes straight from GCS (Range-capable), keeping Cloud Run out of the audio path. `/api/stream/{id}` just 302-redirects to it.

**Uploads are direct-to-storage** (Cloud Run caps request bodies at ~32 MiB). Flow: browser extracts metadata itself (`jsmediatags` for tags/cover, an `<audio>` element for duration) → `POST /api/media/upload-url` mints an id + signed PUT URL → browser PUTs bytes straight to GCS → `POST /api/media/register` creates the record. The backend never buffers audio bytes. Local mode substitutes a `/api/local-upload/{name}` PUT endpoint for the signed URL.

**Signing uses no JSON key.** `GcsStorage` impersonates a signer SA (`SPOTIME_SIGNER_SA`) via IAM SignBlob to produce V4 signatures. Locally your user impersonates it (needs `roles/iam.serviceAccountTokenCreator` on the SA); on Cloud Run the runtime SA signs for itself. Data ops (upload/delete/read) use ambient credentials, *not* the impersonated ones.

**Downloads are the one exception to bytes-never-touch-the-app.** `backend/downloader.py` runs `yt-dlp` server-side on a single background worker (jobs live in memory, so a restart forgets them; the media they created survives, since each track is registered as it finishes). `POST /api/download` returns a job the frontend polls. Tracks land as `music` with the thumbnail as cover art and the playlist title as the album; dedup matches the YouTube video id stored in `original_filename`. Needs `ffmpeg` for the mp3 transcode and `node` for YouTube's JS challenges (both in the Dockerfile); `SPOTIME_DOWNLOAD_MAX` caps playlist size (default 50). **Downloads are meant to be run locally via `make cloud`, not on Cloud Run** — confirmed in production that YouTube answers Cloud Run's IPs with "Sign in to confirm you're not a bot" on every video. `make cloud` runs yt-dlp from your home IP against the same Firestore + GCS the deployed app reads, so tracks land in the production library. `SPOTIME_YTDLP_COOKIES` (a cookies.txt path) would unblock the deployed service but is deliberately unused: the cookies expire fast and risk flagging the Google account.

**`extension/`** is an unpacked Chrome extension (MV3, no build step) that sends the current tab's URL to `POST /api/download` on `localhost:8080`, replacing the copy-paste into the web UI. It downloads nothing itself — MV3 can't run native binaries, so yt-dlp/ffmpeg stay server-side and Spotime must be running (`make cloud` for the real library). Deliberately localhost-only: `make cloud` leaves `SPOTIME_PASSWORD` unset, so the API is open and `host_permissions` exempts the extension's fetches from CORS — **it needs zero backend changes, so don't add CORS middleware or a token endpoint for it.** See `extension/README.md`.

**Chapters** (`backend/chapters.py`): on register, audiobooks get chapters via `ffprobe`, which range-reads only the container metadata (not the whole file) from a local path or the GCS signed URL. Stored on the media record as `chapters` (list of `{title, start_seconds}`); shown as a click-to-seek list.

**The frontend is mid-port to React.** `frontend/` is a Vite + React + TypeScript project
(`src/`, no router, no SSR) building to `frontend/dist`, which `config.FRONTEND_DIR` serves at `/`.
The old vanilla client lives on at `frontend/legacy/`, mounted at `/legacy` and fully functional
until the port lands — spec and tickets in `.scratch/react-frontend-port/`. If no build exists,
the server falls back to the legacy client with a warning rather than refusing to start.

`frontend/public/login.html` is copied verbatim into the build output, so it stays framework-free
at its current path and gates access via an `SPOTIME_PASSWORD` env var (cookie holds
`sha256(password)`).

**Static cache policy is path-aware** (`cache_static` in `backend/main.py`): content-hashed assets
under `/assets/` are `immutable` for a year, everything else static is `no-cache`. Getting this
backwards ships a build users never see; getting it half-right ships one they can never escape.
`tests/test_static_cache.py` pins all of it. Cover art (`/api/media/{id}/artwork`) is the one
`/api` response carrying a cache header: it is written once at register and never replaced, so
it is `immutable`. Uncached it was a stampede — the library fans out one blocking storage read
per row, which saturated the request threadpool and took the service down.

## Cloud / deployment notes

Deployed as Cloud Run service `spotime` in `us-central1`, min-instances=0 (scale to zero). Env vars are already set on the service; `make deploy` redeploys from source. GCP project `spotime-axjobo-2026`, Firestore native mode, bucket `spotime-axjobo-2026-audio`. A **$5/month billing budget alert** is configured on the billing account as a cost tripwire (main cost driver is GCS egress from repeat playback — see README "Next phases" for the cacheable-URL optimization).

- **Bucket CORS is required for browser uploads.** The browser PUTs to the signed URL with `Content-Type`, triggering a CORS preflight; without a bucket CORS policy every upload fails with "Failed to fetch" (playback still works, since `<audio>` GETs aren't preflighted — so this failure hides easily). Re-apply with `gcloud storage buckets update gs://spotime-axjobo-2026-audio --cors-file=cors.json` if the origin/URL changes.
- Local cloud work needs ADC: `gcloud auth application-default login` as the right account. ADC is separate from the gcloud CLI login — a stale ADC for the wrong account causes `PERMISSION_DENIED`.

`initial_spec.md` is the design spec (referenced by section, e.g. §10, §15). The README's "Next phases" section tracks planned work.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
