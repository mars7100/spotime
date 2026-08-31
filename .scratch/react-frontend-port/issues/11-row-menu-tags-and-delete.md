# 11: Row menu — edit tags, delete a track

**What to build:** Each row carries an overflow menu for acting on that one track: edit its tags to correct a mistake without entering a bulk mode, or delete it outright. Deletion asks first.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Each row has an overflow menu, revealed on hover and reachable by keyboard
- [ ] A single track's tags can be edited and saved
- [ ] Tag edits are reflected in the row and in the available tag filters without a reload
- [ ] A single track can be deleted from its own row menu, without entering selection mode
- [ ] Deletion asks for confirmation before it happens
- [ ] The destructive action is visually distinguished from the neutral one
- [ ] Only one row menu is open at a time, and clicking elsewhere closes it
- [ ] Opening the menu does not start playback of that row
- [ ] Tests cover: editing a track's tags and seeing the change reflected; deleting a track behind its confirmation; the menu not triggering playback
