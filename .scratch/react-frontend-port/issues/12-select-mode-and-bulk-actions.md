# 12: Select mode and bulk actions

**What to build:** Enter a selection mode to act on many tracks at once — tagging a batch in one action instead of one edit per track, or clearing out a bad import in one go. The selection's size is always visible, and the destructive action is unmistakable.

**Blocked by:** 11

**Status:** ready-for-human

- [x] Selection mode can be entered and left
- [x] Tracks can be selected and deselected in that mode
- [x] Selected tracks look selected and unselected ones recede, so the shape of the selection is visible
- [x] The number of selected tracks is shown
- [x] A tag can be added to every selected track in one action
- [x] A tag can be removed from every selected track in one action, so a bad bulk tagging can be undone
- [x] Every selected track can be deleted in one action
- [x] Bulk delete looks more dangerous than the other bulk controls and asks for confirmation naming what is about to go
- [x] The selection can be cleared without leaving selection mode
- [x] Bulk actions work correctly against a filtered view, acting on what is selected rather than on everything
- [x] Tests cover: selecting and counting; bulk tag add; bulk tag remove; bulk delete behind its confirmation; clearing a selection

## Comments

2026-09-10 — Built. Selection is one value in `Library.tsx`: `Set<string> | null`, null
meaning not in select mode, so mode and picks cannot disagree; ids pruned on reload.
`BulkBar` (`frontend/src/features/library/BulkBar.tsx`) does the requests itself.
Legacy semantics kept: music only (books dim and go inert), selection survives tag
add/remove, clears after delete, and is not pruned by filters — a pick hidden by the
search box still counts and is still acted on. Native confirm names up to five titles.
Verified in Chrome. Not carried over: stopping the player when a playing track is
bulk-deleted (no stop command in `PlayerCommands`; same gap as ticket 11).
