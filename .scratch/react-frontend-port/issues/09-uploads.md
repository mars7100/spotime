# 09: Uploads — files, folder, and drag-and-drop

**What to build:** Add audio from disk, either by picking files, by picking a whole folder so an album or a multi-file book arrives in one action, or by dragging onto the window. Metadata the file already carries — title, artist, album, cover art, duration — is read automatically rather than retyped. Large uploads show progress, and a failure says what went wrong.

Bytes go straight to storage and never pass through the server, so the existing three-step flow is preserved exactly.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] One or more files can be selected and uploaded
- [ ] A whole folder can be selected, and its contents upload as one action
- [ ] Dragging files over the window shows a visible drop target, and dropping uploads them
- [ ] Each file shows upload progress, so a large book is visibly moving rather than apparently stuck
- [ ] Title, artist, album, and cover art are extracted from the file in the browser
- [ ] Duration is extracted in the browser, so the library's duration column is populated for new uploads
- [ ] The three-step flow is preserved: request an upload target, send the bytes directly to storage, then register the record. No audio passes through the server
- [ ] Re-uploading a file already in the library is recognised and does not create a duplicate
- [ ] A failure at any step surfaces a message naming what failed, rather than a bare count or a silent stop
- [ ] Uploads work unchanged in both local and cloud storage modes
- [ ] Tests cover: the three steps being performed in order; a failure at each step surfacing a message that names it
