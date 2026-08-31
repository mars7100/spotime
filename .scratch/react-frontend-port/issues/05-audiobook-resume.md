# 05: Audiobook resume and position persistence

**What to build:** Reopen an audiobook and it resumes exactly where you stopped — the behaviour the whole app exists for. Your position is saved as you listen and when you leave, so a crash or a closed tab costs seconds rather than an hour, and the library shows how far through each book you are.

**Blocked by:** 04

**Status:** ready-for-human

- [x] Playing an audiobook with a saved position starts at that position, not at zero
- [x] Position is saved periodically while playback is running
- [x] Position is saved when the page is hidden and when it is unloaded
- [x] The library shows progress through a book, with a resume label giving the position and percentage
- [x] A finished book is marked as finished and is distinguishable from an untouched one
- [x] Skip back fifteen seconds and forward thirty are available while an audiobook is playing
- [x] Those two controls do not appear for music
- [x] Playback speed is persisted alongside position for audiobooks
- [x] Songs remain unaffected: no position is read, written, or displayed for them
- [x] Tests cover: an audiobook resuming at its saved position; periodic saving during playback using simulated time rather than real waiting; a save being issued when the page is hidden

## Comments

Built. `uv run pytest` — 4 passing; `npm --prefix frontend run test` — 45 passing across five files.

**How resume works.** `play()` asks for the play URL and the saved state together,
and only for an audiobook — `keepsState` makes the music branch a compile-time
matter, so a song is never asked about at all. The position is read fresh from the
server rather than taken from the library payload, which may be minutes old or have
been written by another device. The seek itself is registered as an `onLoaded`
handler on the source (a media element cannot be seeked before it knows its
duration), under the same `AbortController` as `onEnded`, so a source that gets
replaced mid-load can neither advance the queue nor seek the track that displaced it.

**Saving.** A fifteen-second interval while playing, plus a flush on pause, seek,
skip, speed change, book change, and end-of-book (with `completed: true`). The timer
is driven by the element's own `play`/`pause` events rather than by the commands, so
however playback started or stopped — a lock-screen button, a rejected autoplay — the
timer follows what is actually happening. Page-hide and `pagehide` saves go out with
`keepalive`, so the request outlives the document instead of being cancelled.

**Two bugs found while checking this in a browser, both now covered:**

1. *A save could write a zero over a good position.* Before metadata arrives,
   `currentTime` is 0 because there is no audio — not because the listener is at the
   start. The interval fired during a slow load and destroyed the exact thing this
   feature exists to protect. Saves are now skipped until the element has a duration.
   Observed for real: a seeded position of 72s came back as 0.
2. *The restored speed was being thrown away.* Assigning `src` starts the media load
   algorithm, which resets `playbackRate` to `defaultPlaybackRate`. Speed was being
   applied before the source, so a 1.25× book snapped back to 1×. It is now applied
   after the source, and `defaultPlaybackRate` is set too. jsdom does not model this
   part of the algorithm, so `src/test/media.ts` now does — the stub reproduces the
   reset, and the test fails without the fix.

**Deliberate choices**

- Speed belongs to the book, not the session: a song plays at 1× unless changed, which
  is what the vanilla client did.
- A finished book restarts from the beginning rather than from its last second.
- A position under five seconds is treated as a mis-tap and ignored, matching the
  legacy resume threshold and the library's own "resumable" rule.
- The library's progress bar and resume label already came from ticket 03; they are
  rendered from the library payload, so a row still shows the position it was loaded
  with until the next load. Live-updating a row as its book plays is not in this
  ticket's criteria and would need the list to re-fetch on save.
- Chapter-to-chapter playback for a folder book stays in ticket 06.

**Verified in the browser, partially.** The library row, resume label and percentage,
the audiobook-only skip controls, and the player layout were all confirmed against a
temporary audiobook seeded with a saved position (since removed, along with its file).
Audible playback could not be confirmed: Chrome's media pipeline stopped loading *any*
source part-way through the session — a data-URI WAV hangs at `readyState 0` too — so
that is an environment failure, not an app one. Both bugs above were nonetheless found
through that session and are pinned by tests.
