# Spotime

A personal web audio library for music + audiobooks with **persistent playback
position** — open a file later and it resumes near where you stopped.

## Status: Phase 1 (local proof of concept)

Runs entirely on your machine: audio files on local disk, metadata + playback
state in SQLite. No Google Cloud yet. Storage and DB are behind small interfaces
so GCS + Firestore drop in for later phases (see `initial_spec.md` §15).

Proven working:

- Upload `.mp3` / `.m4a` / `.m4b` (and other common audio) with automatic
  metadata + cover-art extraction (Mutagen).
- Browse / search library, filter by Music vs Audiobooks.
- Play with HTTP Range streaming (seeking works), speed control, ±15/30s skip.
- Playback position saved every ~15s, on pause/seek/tab-hide/close, and on end.
- **Resume across browser sessions** — the Phase 1 milestone.
- Music resets to start after finishing; audiobooks keep their position.

## Run

```bash
make dev                      # SQLite + local disk (default)
make dev-firestore            # Firestore for state, local disk for audio
make cloud                    # Firestore + GCS (full cloud, like production)
```

Then open http://localhost:8080

### Firestore (Phase 2)

Audio still lives on local disk; only metadata + playback state move to Firestore.
The backend is chosen with `SPOTIME_DB_BACKEND` (`sqlite` default, or `firestore`).

```bash
GOOGLE_CLOUD_PROJECT=spotime-axjobo-2026 make dev-firestore
```

Requires Application Default Credentials once:
`gcloud auth application-default login`. The two backends do **not** share data.

### Cloud Storage (Phase 3)

`SPOTIME_STORAGE_BACKEND=gcs` stores audio in a private GCS bucket and serves it
via short-lived V4 signed URLs — the browser fetches bytes straight from GCS
(Range-capable), so the backend never proxies audio (spec §10).

Signing never uses a JSON key: the app impersonates a signer service account
(`SPOTIME_SIGNER_SA`) via IAM SignBlob. Locally your user impersonates it (needs
`roles/iam.serviceAccountTokenCreator` on the SA); on Cloud Run the runtime SA
signs for itself. Data ops (upload/delete) use ambient credentials, not the
impersonated ones.

```bash
make cloud   # sets GOOGLE_CLOUD_PROJECT, both backends, bucket, and signer SA
```

## Layout

```
backend/
  main.py       FastAPI app + API routes + Range streaming
  db.py         SQLite (mirrors the media/ and playback_state/ collections)
  storage.py    Storage interface + LocalStorage (GCS swaps in here later)
  metadata.py   Mutagen extraction
  config.py     Paths / settings (env-overridable)
frontend/
  index.html, app.js, style.css   single-page vanilla JS client
data/           gitignored — audio files + spotime.db
```

## API

| Method | Path                        | Purpose                             |
| ------ | --------------------------- | ----------------------------------- |
| GET    | `/api/media?search=`        | list library (with state)           |
| GET    | `/api/media/{id}`           | one item                            |
| POST   | `/api/media/upload-url`     | mint id + signed PUT URL            |
| POST   | `/api/media/register`       | create record after direct upload   |
| DELETE | `/api/media/{id}`           | delete                              |
| GET    | `/api/media/{id}/play`      | playback URL                        |
| GET/PUT| `/api/media/{id}/state`     | get / update playback state         |
| GET    | `/api/media/{id}/artwork`   | cover art                           |
| GET    | `/api/stream/{id}`          | Range-capable audio stream (local)  |

### Upload flow

Bytes never pass through the backend (Cloud Run caps request bodies at ~32 MiB).
The browser extracts metadata itself (jsmediatags for tags/cover, an `<audio>`
element for duration), requests a signed PUT URL, uploads straight to GCS, then
registers the record. Works for large audiobooks.

### Chapters

On register, audiobooks get chapters via `ffprobe`, which reads them straight
from the file — a local path, or the GCS signed URL it range-fetches (only the
container metadata, never the whole file). Stored on the media record and shown
as a click-to-seek list in the player. Needs `ffmpeg` in the image (in Dockerfile).

## Next phases

2. Swap SQLite → Firestore. 3. Swap LocalStorage → GCS signed URLs.
4. Richer metadata (chapters via ffprobe). 5. Dockerfile + Cloud Run.
6. QoL: sorting, recently played, better artwork.
