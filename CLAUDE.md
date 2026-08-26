# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Spotime is a personal web audio library (music + audiobooks) whose defining feature is **persistent playback position** — reopen an audiobook and it resumes where you stopped. Music keeps no position at all: every play starts at 0. Enforced server-side in `main.py` (`_keeps_state`), so no store backend can hand back a stale music position.

## Commands

```bash
make dev            # SQLite + local disk (default) — http://localhost:8080
make dev-firestore  # Firestore for metadata/state, local disk for audio (needs GOOGLE_CLOUD_PROJECT)
make cloud          # Firestore + GCS signed URLs (full cloud, mirrors production)
make run            # no auto-reload, binds 0.0.0.0 (production-like)
make deploy         # gcloud run deploy to Cloud Run (us-central1)
make install        # uv sync
make reset          # DESTRUCTIVE: rm -rf data/ (wipes local audio + spotime.db)
```

Dependencies are managed with **uv** (`uv sync`, `uv run …`), Python ≥3.12.10.

There is currently **no automated test suite**. When adding tests, set `SPOTIME_DATA_DIR` to a temp dir so tests never touch the real `data/` directory (which `make reset` wipes). External audio tooling: `ffprobe`/`ffmpeg` must be on PATH for chapter extraction (installed in the Dockerfile image).

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

**Chapters** (`backend/chapters.py`): on register, audiobooks get chapters via `ffprobe`, which range-reads only the container metadata (not the whole file) from a local path or the GCS signed URL. Stored on the media record as `chapters` (list of `{title, start_seconds}`); shown as a click-to-seek list.

The frontend (`frontend/`) is a single-page vanilla-JS client (`app.js`, `index.html`, `style.css`) — no build step. `login.html` gates access via an `SPOTIME_PASSWORD` env var (cookie holds `sha256(password)`).

## Cloud / deployment notes

Deployed as Cloud Run service `spotime` in `us-central1`, min-instances=0 (scale to zero). Env vars are already set on the service; `make deploy` redeploys from source. GCP project `spotime-axjobo-2026`, Firestore native mode, bucket `spotime-axjobo-2026-audio`. A **$5/month billing budget alert** is configured on the billing account as a cost tripwire (main cost driver is GCS egress from repeat playback — see README "Next phases" for the cacheable-URL optimization).

- **Bucket CORS is required for browser uploads.** The browser PUTs to the signed URL with `Content-Type`, triggering a CORS preflight; without a bucket CORS policy every upload fails with "Failed to fetch" (playback still works, since `<audio>` GETs aren't preflighted — so this failure hides easily). Re-apply with `gcloud storage buckets update gs://spotime-axjobo-2026-audio --cors-file=cors.json` if the origin/URL changes.
- Local cloud work needs ADC: `gcloud auth application-default login` as the right account. ADC is separate from the gcloud CLI login — a stale ADC for the wrong account causes `PERMISSION_DENIED`.

`initial_spec.md` is the design spec (referenced by section, e.g. §10, §15). The README's "Next phases" section tracks planned work.
