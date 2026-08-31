# 04: Playback core — the audio element outside React

**What to build:** Click a music track and it plays. The player bar gives you play and pause, scrubbing, elapsed and total time, previous and next, shuffle, speed, and volume. Playback continues to the next track on its own. Every song starts from the beginning, every time.

This is the load-bearing ticket of the whole port. A media element is a large stateful object that must never be unmounted — if it is, playback stops and the saved position corrupts. Verify this architecture holds before any further UI is built on top of it.

**Blocked by:** 03

**Status:** ready-for-human

- [x] A single media element is created once outside the component tree and is never unmounted
- [x] A provider mirrors the element's events into application state; components render from the element and send commands to it, but never own it
- [x] The element records which source is currently loaded, so a finished track's end-of-playback event cannot be mistaken for the end of the track that replaced it
- [x] Clicking a music track plays it
- [x] Play and pause work, and the control reflects actual playback state
- [x] Scrubbing seeks to any point; elapsed and total time are shown and stay accurate
- [x] Previous and next move through the queue
- [x] Finishing a track advances to the next automatically
- [x] The queue is built from the music currently in view, in library order
- [x] Shuffle reorders the queue without dropping or duplicating tracks
- [x] Playback speed can be changed and takes effect
- [x] Volume can be changed from the player and takes effect
- [x] Every song starts at zero regardless of what the server returns for it, and no position save is ever issued for a song
- [x] The player is a three-column layout: now-playing metadata, transport with the scrubber beneath it, and secondary controls
- [x] Every player control uses a vector icon; no emoji or box-drawing glyph remains anywhere in the player
- [x] The playing row in the library is marked by an accent rail and accent title, not by a background tint alone
- [x] Tests cover: a song starting at zero and issuing no save; automatic hand-off to the next track; a stale end-of-playback event from a previous source not skipping the current track

## Comments

Built. `npm --prefix frontend run test` — 30 passing across four files; `uv run pytest` — 4 passing.

**Where the architecture landed**

- `src/player/audio.ts` creates the one media element at import and appends it to
  the document outside React's root, so React never owns it and cannot unmount it.
  It also holds `loadedId`, the id whose URL is in `src` right now.
- `src/player/PlayerProvider.tsx` mirrors the element's events into state and hands
  out commands. State is split across three contexts — commands (stable),
  now-playing (id + playing), and the ticking state (position, duration, volume…) —
  so a library row does not re-render four times a second alongside the scrubber.
- `src/player/queue.ts` holds the queue as pure functions; the library hands over
  what is in view and the queue is derived from it, so ticket 07's narrowing needs
  no player change.

**The stale end-of-playback event.** Two mechanisms, and the first is the load-bearing
one: the `ended` listener is registered per source with an `AbortController` that is
aborted as the next source loads, so a replaced track's event reaches nobody. On top
of that, the handler tells `advance` *which id finished* rather than letting it read
"what is playing now" — those two differ for exactly as long as a track change is in
flight, which is precisely when a late event lands. Stepping from the incoming track
there would skip the song the listener just picked. Both guards were mutation-checked:
reverting either makes `Playback.test.tsx` fail with the skip it describes.

**Deliberate choices**

- Shuffle is a Fisher–Yates permutation of the queue, not the legacy client's
  roll-a-random-next-track. The ticket asks for a reorder that drops and duplicates
  nothing, which a per-track random pick cannot promise. The playing track is pinned
  to the head so toggling shuffle mid-song does not yank it.
- Clicking an audiobook row plays it from zero with no state read or write. Resume is
  ticket 05; a folder book opens at its first chapter until 06 wires chapter order.
- Books stay out of the music queue, matching the legacy client: a book advances
  chapter-to-chapter on its own and must never be handed the next song.
- Volume and shuffle persist to `localStorage`, as the vanilla client did for shuffle.
- Repeat remains out of scope, per the spec.

**Test tooling added for later tickets.** `src/test/media.ts` stubs jsdom's inert
`HTMLMediaElement` (play, pause, currentTime, duration, playbackRate, volume) and
exposes `mediaElement()`, `givenMetadata()`, `advanceTo()` and `endCurrentTrack()` —
ticket 05's periodic-save tests will want all four. The play-URL endpoint now answers
by default in `src/test/server.ts`.
