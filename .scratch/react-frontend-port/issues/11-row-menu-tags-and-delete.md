# 11: Row menu — edit tags, delete a track

**What to build:** Each row carries an overflow menu for acting on that one track: edit its tags to correct a mistake without entering a bulk mode, or delete it outright. Deletion asks first.

**Blocked by:** 03

**Status:** ready-for-human

- [x] Each row has an overflow menu, revealed on hover and reachable by keyboard
- [x] A single track's tags can be edited and saved
- [x] Tag edits are reflected in the row and in the available tag filters without a reload
- [x] A single track can be deleted from its own row menu, without entering selection mode
- [x] Deletion asks for confirmation before it happens
- [x] The destructive action is visually distinguished from the neutral one
- [x] Only one row menu is open at a time, and clicking elsewhere closes it
- [x] Opening the menu does not start playback of that row
- [x] Tests cover: editing a track's tags and seeing the change reflected; deleting a track behind its confirmation; the menu not triggering playback

## Comments

2026-09-10 — Built. `RowMenu` (`frontend/src/features/library/RowMenu.tsx`) on every row:
music gets Edit tags + Delete, audiobook rows Delete only (a folder book deletes all its
chapters via `bulk-delete`). Native `prompt`/`confirm` per the spec's out-of-scope note.
One menu open at a time falls out of a document `pointerdown` listener per open menu.
Verified in Chrome: the first cut's click fell through to the play hit — `.row > *`
out-specified `.row-menu`'s `pointer-events: auto`, invisible in jsdom — fixed with
`.row > .row-menu`. Deleting the playing track leaves playback running (as in legacy).
