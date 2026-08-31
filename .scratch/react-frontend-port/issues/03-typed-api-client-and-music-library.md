# 03: Typed API client and the music library list

**What to build:** Open the app and see your real library rendered in the new design. Music rows carry cover art, title, artist and album, tags in their own column, and a duration — the last of which the current client shows nowhere. The list is read-only for now; nothing plays yet.

This ticket is deliberately thin so that the playback core, which is the riskiest part of the port, arrives as early as possible. It exists mostly to give playback something to play from, and to establish the app-seam test setup that later tickets extend.

**Blocked by:** 02

**Status:** ready-for-human

- [x] The whole library loads on open without a further click
- [x] One typed client module wraps the existing endpoints; nothing else in the app issues requests
- [x] The media record and playback state are typed, with playback state nullable exactly as the API makes it: a music record carries none
- [x] The type for a music record makes reading a saved position a compile error rather than a runtime surprise, mirroring the server-side rule
- [x] Music rows render as a grid: track index, cover art, a title and artist/album block, a tags column, a duration column, and an overflow menu slot revealed on hover
- [x] Durations are monospaced with tabular figures so they align down the column
- [x] A record with no recorded duration renders an em dash, not a zero
- [x] Tags render as quiet unfilled labels in their own column, visually subordinate to the title
- [x] The library is grouped into sections so recently added material is reachable without scrolling past everything
- [x] An empty library shows a message saying what to do next
- [x] Audiobook records also render, keeping their current row treatment restyled onto the new tokens, with their progress indicator intact
- [x] Songs show no progress indicator at all
- [x] A test setup renders the whole app with HTTP faked at the network boundary, and asserts on rendered output and issued requests only — never on component internals, props, or state shape

## Comments

**2026-08-31 — agent:** Implemented. `src/api/types.ts` discriminates on `media_type`: a
`MusicRecord`'s `state` is `null` (not optional), so reading a position off a song fails to
compile — the type-system mirror of `_keeps_state` in `backend/main.py`. `src/api/client.ts` is
the only module that issues requests and normalises payloads so a bad response can't smuggle a
state onto music; it wires the library, play URL and state endpoints (playback lands next),
leaving tags/delete/upload/download to their own tickets.

The list follows the mockup's grid (`22px 42px minmax(0,1fr) auto minmax(46px,auto) 28px`) —
index, art, title over artist and album, tags as quiet labels in their own column, mono tabular
duration, and a reserved slot for the ticket-11 overflow menu so the grid won't shift. Null
durations render an em dash. Sections are "Recently added" (5 newest) and "Library" with mono
counts. Audiobooks keep the vanilla treatment restyled: progress bar, resume line, finished
marker, and multi-file books collapsed by `book_id` into one card (`cards.ts`, ported from the
old `toCards`/`computeBook`) — without that a 30-chapter book floods the list. Songs get no
progress indicator at all.

Test seam established: vitest + jsdom + Testing Library with **msw** faking HTTP at the network
boundary, `onUnhandledRequest: "error"`, and a `requests` log so tests can assert what the app
asked for. 9 tests in `src/App.test.tsx` render the whole app and assert only on rendered output
and issued requests. `make test` runs pytest + vitest; `make test-web` for the frontend alone.

The header is the wordmark only — search, kind tabs, tag filters, the row menu and the upload
buttons belong to tickets 07/09/11, and shipping them dead would look broken. Rows aren't
clickable yet; ticket 04 wires playback.
