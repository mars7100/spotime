# Add to Spotime (Chrome extension)

A button that sends the page you're on to your **locally running** Spotime, so
adding a playlist stops being a copy-paste round trip.

It does not download anything itself. MV3 extensions can't run native binaries,
so yt-dlp and ffmpeg stay on your machine — the extension just POSTs a URL to
`/api/download` and the existing background worker (`backend/downloader.py`)
does the work. **Spotime has to be running**, and for the tracks to land in the
real library that means `make cloud`.

## Install

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this `extension/` folder

## Use

- **Toolbar button** on a YouTube page. A `/playlist` page downloads the whole
  thing; a watch page inside a playlist asks which you meant; anything else is a
  single track. Auto-generated mixes (`list=RD…`) are never enumerated — they're
  endless, and `SPOTIME_DOWNLOAD_MAX` worth of algorithmic filler is not a
  library. Optional comma-separated tags, autocompleted from tags you already use.
- **Right-click** a link or page → *Add to Spotime* / *Add whole playlist to Spotime*.
- The toolbar badge counts in-flight jobs and turns red on failure; a
  notification reports what was added, skipped, or failed.

## Why localhost only

`make cloud` leaves `SPOTIME_PASSWORD` unset, so the local API is open and
`host_permissions` exempts the extension's fetches from CORS — no backend
changes, no token handling. Pointing this at the deployed Cloud Run service
would need the `spotime_auth` cookie and wouldn't help anyway: YouTube answers
Cloud Run's IPs with "Sign in to confirm you're not a bot".

If the server isn't up, or is up but password-gated, the popup says so and tells
you what to run instead of failing silently.
