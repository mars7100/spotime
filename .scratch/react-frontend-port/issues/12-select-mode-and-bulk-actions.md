# 12: Select mode and bulk actions

**What to build:** Enter a selection mode to act on many tracks at once — tagging a batch in one action instead of one edit per track, or clearing out a bad import in one go. The selection's size is always visible, and the destructive action is unmistakable.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Selection mode can be entered and left
- [ ] Tracks can be selected and deselected in that mode
- [ ] Selected tracks look selected and unselected ones recede, so the shape of the selection is visible
- [ ] The number of selected tracks is shown
- [ ] A tag can be added to every selected track in one action
- [ ] A tag can be removed from every selected track in one action, so a bad bulk tagging can be undone
- [ ] Every selected track can be deleted in one action
- [ ] Bulk delete looks more dangerous than the other bulk controls and asks for confirmation naming what is about to go
- [ ] The selection can be cleared without leaving selection mode
- [ ] Bulk actions work correctly against a filtered view, acting on what is selected rather than on everything
- [ ] Tests cover: selecting and counting; bulk tag add; bulk tag remove; bulk delete behind its confirmation; clearing a selection
