# 14: Contract — retire the vanilla client

**What to build:** The React app is now at parity, so the old client and everything propping it up comes out. This is the **contract** half of the expand–contract sequence begun in ticket 02: the legacy path that kept Spotime usable throughout the port is removed, leaving one frontend.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13

**Status:** ready-for-human

- [x] The vanilla client's script, stylesheet, and entry page are deleted
- [x] The vendored metadata-extraction script is deleted, its packaged equivalent having replaced it
- [x] The legacy path added in ticket 02 is removed, along with whatever copied the old files into the build output
- [x] The workaround rule for elements that would not hide is gone and has not been carried across; under the new architecture the condition lives in the model and the element simply is not rendered
- [x] No emoji or box-drawing glyph remains anywhere in the interface
- [x] Project documentation no longer describes the frontend as a no-build-step vanilla client, and describes the current stack, development command, and build instead
- [x] The full test suite passes and the container image builds and serves the app
- [x] The interface is reviewed by eye against the approved mockup, since appearance is not asserted by tests

## Comments

2026-09-10 — Done. `frontend/legacy/` (client + vendored jsmediatags) deleted; `/legacy`
mount, `LEGACY_FRONTEND_DIR`, the Dockerfile COPY and the Vite proxy entry removed. With no
build the server now serves the API only and warns (Vite serves the UI in dev); with a build,
`/` 200 and `/legacy/` 404. No `[hidden]` workaround or emoji/box glyph exists in `frontend/src`.
Verified: pytest 5/5, vitest 124/124, `make build`, uvicorn from `dist`, `docker build` +
run (`/` and `/api/media` 200). Reviewed by eye against the mockup on the built app:
matches on palette, row grid, playing state, player layout. Two deviations left as-is for a
human call: the active kind tab is amber-filled (mockup: `surface-2`), and the upload
buttons sit under the wordmark rather than on its line.
