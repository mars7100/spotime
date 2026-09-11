# 09: Uploads — files, folder, and drag-and-drop

**What to build:** Add audio from disk, either by picking files, by picking a whole folder so an album or a multi-file book arrives in one action, or by dragging onto the window. Metadata the file already carries — title, artist, album, cover art, duration — is read automatically rather than retyped. Large uploads show progress, and a failure says what went wrong.

Bytes go straight to storage and never pass through the server, so the existing three-step flow is preserved exactly.

**Blocked by:** 03

**Status:** ready-for-human

- [x] One or more files can be selected and uploaded
- [x] A whole folder can be selected, and its contents upload as one action
- [x] Dragging files over the window shows a visible drop target, and dropping uploads them
- [x] Each file shows upload progress, so a large book is visibly moving rather than apparently stuck
- [x] Title, artist, album, and cover art are extracted from the file in the browser
- [x] Duration is extracted in the browser, so the library's duration column is populated for new uploads
- [x] The three-step flow is preserved: request an upload target, send the bytes directly to storage, then register the record. No audio passes through the server
- [x] Re-uploading a file already in the library is recognised and does not create a duplicate
- [x] A failure at any step surfaces a message naming what failed, rather than a bare count or a silent stop
- [x] Uploads work unchanged in both local and cloud storage modes
- [x] Tests cover: the three steps being performed in order; a failure at each step surfacing a message that names it

## Comments

Built. Files, folder and drag-and-drop all land in one queue (`frontend/src/features/upload/`);
tags and cover art come from `jsmediatags` as an npm dependency, loaded on demand so it is its own
chunk. The package's `browser` field points at a file it does not ship, so the browser bundle is
imported by path and typed in a local `.d.ts`.

Folder grouping is ported whole: a folder of two or more audio files becomes one book, chapters
ordered by track tag then natural filename, reusing an existing book's id when the title matches so
re-adding a folder resumes rather than duplicating. Dedup is checked client-side on
`(book_id, original_filename)` — the same scoping the server dedups on — so a re-drop sends no bytes.

The library now reloads on a `notifyLibraryChanged()` signal (`features/library/refresh.ts`) rather
than on a reference to the list, so each track appears as it registers. Tickets 10 and 11 want the
same signal.

One test-environment shim was needed: jsdom's `Blob` has no `stream()`, which the request
interceptor calls to read an upload body, so `src/test/setup.ts` installs one.

Cloud mode is unchanged by construction rather than by test: the signed URL, method and headers
from `/api/media/upload-url` are sent back verbatim, exactly as the vanilla client sent them. It was
exercised against local storage only.

`uv run pytest` — 4 passing; `npm --prefix frontend run test` — 105 passing. Also verified by hand in
the browser against `make dev`: upload, live library refresh, duplicate recognition, drop overlay.
