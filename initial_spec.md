Here’s a solid MVP spec plan for the system you described.

## 1. Product goal

Build a personal web-based audio library for both:

* Music
* Audiobooks

The primary requirement is **persistent playback state**, so opening the same audio file later resumes close to where playback stopped.

The system will be accessed from Safari or Chrome and deployed as **one Cloud Run service/container**.

---

## 2. MVP scope

The first version should support:

| Capability                     | MVP   |
| ------------------------------ | ----- |
| Upload audio files             | Yes   |
| Browse library                 | Yes   |
| Play audio                     | Yes   |
| Pause / resume                 | Yes   |
| Seek                           | Yes   |
| Remember playback position     | Yes   |
| Resume across browser sessions | Yes   |
| Music + audiobooks             | Yes   |
| Metadata extraction            | Yes   |
| Cover art                      | Basic |
| Search                         | Yes   |
| Playback speed                 | Yes   |
| Delete files                   | Yes   |
| Playlists                      | Later |
| Offline playback               | Later |
| Recommendations                | No    |
| Audio transcoding              | No    |
| Multi-user support             | No    |

I would deliberately keep playlists and offline caching out of v1.

---

# 3. Architecture

```text
Safari / Chrome
       |
       | HTTPS
       v
┌──────────────────────────────┐
│        Cloud Run             │
│        One Container         │
│                              │
│  Frontend                    │
│  Backend API                 │
│  Metadata extraction         │
└──────────┬───────────────────┘
           |
     ┌─────┴───────────────┐
     │                     │
     v                     v
┌─────────────┐      ┌───────────────┐
│ Firestore   │      │ Cloud Storage │
│             │      │               │
│ metadata    │      │ .mp3          │
│ progress    │      │ .m4a          │
│ settings    │      │ .m4b          │
└─────────────┘      │ artwork       │
                     └───────────────┘
```

The browser handles the actual audio playback.

Cloud Run handles application logic.

Cloud Storage holds the bytes.

Firestore holds state.

---

# 4. Suggested stack

For a first implementation:

```text
Frontend:
React + TypeScript

Backend:
FastAPI + Python

Deployment:
Docker
Cloud Run

Audio storage:
Google Cloud Storage

Application data:
Firestore

Metadata:
Mutagen
ffprobe / FFmpeg

Authentication:
None initially
or simple Google authentication later
```

Because this is a single-user application, authentication can initially be extremely minimal.

---

# 5. Core domain model

I would treat music and audiobooks as the same fundamental object:

```text
MediaItem
```

with a type:

```text
music
audiobook
```

Example:

```json
{
  "id": "abc123",
  "title": "Dune",
  "media_type": "audiobook",
  "artist": "Frank Herbert",
  "album": null,
  "duration_seconds": 75643,
  "storage_path": "audio/abc123.m4b",
  "artwork_path": "covers/abc123.jpg",
  "created_at": "2026-08-23T22:00:00Z"
}
```

Music:

```json
{
  "id": "xyz789",
  "title": "Everlong",
  "media_type": "music",
  "artist": "Foo Fighters",
  "album": "The Colour and the Shape",
  "duration_seconds": 250,
  "storage_path": "audio/xyz789.mp3"
}
```

This avoids building two separate systems.

---

# 6. Playback state

This should be modeled separately from the audio metadata.

```json
{
  "media_id": "abc123",
  "position_seconds": 18432.7,
  "duration_seconds": 75643,
  "playback_speed": 1.25,
  "last_played_at": "2026-08-23T22:35:00Z",
  "completed": false
}
```

Conceptually:

```text
MediaItem
    1
    |
    |
    1
PlaybackState
```

Even though Firestore isn't relational, this separation is still useful.

---

# 7. Playback-state behavior

This is probably the most important part of the spec.

When playback starts:

```text
GET playback state
        |
        v
position = 18,432.7
        |
        v
audio.currentTime = 18,432.7
```

While listening, update the backend:

* every ~15 seconds
* on pause
* on seek
* before changing tracks
* when the browser page becomes hidden
* when playback ends

Do **not** update Firestore every second.

Something like:

```text
0 sec
 |
15 sec ─── save
 |
30 sec ─── save
 |
45 sec ─── save
 |
pause ──── save immediately
```

This means if Safari crashes, at worst you lose roughly 15 seconds of progress.

---

# 8. Music vs audiobook behavior

They can share the backend but have slightly different UX.

### Audiobook

Always resume:

```text
Dune

Resume
5:07:12 / 21:00:43
```

Track:

* current position
* playback speed
* completion %
* last played

### Music

I would initially track:

* currently playing song
* current position
* last played

But music usually shouldn't permanently resume every song from 2:13.

For example:

```text
Song played to 2:13
User listens to another song
User returns tomorrow
```

Most music players restart that song from `0:00`.

So you could have a rule:

```text
Audiobook:
always persist position

Music:
persist active session position,
but reset when track changes/completes
```

That is an application-level distinction worth defining early.

---

# 9. Upload flow

User:

```text
Upload Dune.m4b
```

Flow:

```text
Browser
   |
   | upload
   v
Cloud Run
   |
   +--> Cloud Storage
   |
   +--> extract metadata
          |
          v
        Mutagen
        ffprobe
          |
          v
       Firestore
```

Extract things such as:

```text
filename
title
artist
album
duration
bitrate
codec
embedded cover
chapters
```

If metadata doesn't exist:

```text
title = filename
```

---

# 10. Playback flow

The backend should not proxy the whole file.

Instead:

```text
GET /api/media/abc123/play
```

Cloud Run generates a temporary signed URL:

```text
https://storage.googleapis.com/...
```

Then:

```text
Browser -------------------> Cloud Storage
        audio bytes
```

Cloud Run is out of the audio path.

This keeps the container extremely lightweight.

---

# 11. MVP API

I'd keep the API small.

### Library

```http
GET /api/media
```

Return library.

```http
GET /api/media/{id}
```

Return metadata.

```http
POST /api/media
```

Upload/register media.

```http
DELETE /api/media/{id}
```

Delete media.

---

### Playback

```http
GET /api/media/{id}/play
```

Generate temporary audio URL.

```http
GET /api/media/{id}/state
```

Retrieve playback state.

```http
PUT /api/media/{id}/state
```

Example:

```json
{
  "position_seconds": 18432.7,
  "playback_speed": 1.25
}
```

---

# 12. UI

For v1, I'd keep it extremely simple.

```text
┌──────────────────────────────────────────┐
│ My Audio                                 │
├──────────────────────────────────────────┤
│ Search...                                │
│                                          │
│ Music          Audiobooks                │
│                                          │
│ Dune                                     │
│ Frank Herbert                            │
│ ███████████░░░░░░░░░ 42%                 │
│ Resume 5:07:12                           │
│                                          │
│ Everlong                                 │
│ Foo Fighters                             │
│                                          │
└──────────────────────────────────────────┘

                 Player

        Dune - Frank Herbert

     ◀      ▶ / ❚❚       ▶▶

           5:07:12
    ─────────●────────────
          21:00:43

           Speed: 1.25x
```

You don't need to clone Spotify's interface.

The first goal should be:

> select file → play → close browser → reopen → resume.

If that works reliably, you've validated the core system.

---

# 13. Firestore layout

Something like:

```text
media/
    abc123
    xyz789

playback_state/
    abc123
    xyz789
```

For example:

```text
media/abc123
```

```json
{
  "title": "Dune",
  "type": "audiobook",
  "duration": 75643,
  "storage_path": "audio/abc123.m4b"
}
```

and:

```text
playback_state/abc123
```

```json
{
  "position": 18432.7,
  "speed": 1.25,
  "updated_at": "..."
}
```

---

# 14. Container boundary

Everything application-related can live in **one container**:

```text
audio-app/
│
├── backend/
│   ├── main.py
│   ├── media/
│   ├── playback/
│   └── storage/
│
├── frontend/
│   └── React app
│
├── Dockerfile
└── requirements.txt
```

Production:

```text
Cloud Run
    |
    └── audio-app container
```

You don't need:

```text
frontend container
backend container
worker container
metadata container
```

at this scale.

---

# 15. Implementation order

I would build this vertically instead of implementing all backend features first.

**Phase 1 — Local proof of concept**

```text
local MP3
    ↓
browser audio player
    ↓
capture currentTime
    ↓
save state
    ↓
reload
    ↓
resume
```

No Google Cloud yet.

**Phase 2 — Basic backend**

```text
React
   ↓
FastAPI
   ↓
Firestore
```

Persist playback state remotely.

**Phase 3 — Cloud Storage**

Upload audio and play it through a signed URL.

**Phase 4 — Metadata**

Add Mutagen/ffprobe and populate the library automatically.

**Phase 5 — Deploy**

```text
Docker
 ↓
Cloud Run
```

**Phase 6 — Quality-of-life features**

Search, artwork, audiobook progress %, playback speed, sorting, recently played.

---

## The first milestone I would use

Don't define MVP success as "Spotify clone works."

Define it as:

> **I can upload one `.mp3` and one `.m4b`, open either from Safari, play it, close the browser, reopen the application, and resume from the correct position.**

Once that works, you've proven essentially every important architectural component:

```text
Browser playback
        +
Cloud Storage
        +
Cloud Run
        +
Firestore
        +
persistent state
```

Everything after that is feature development rather than architectural uncertainty.
