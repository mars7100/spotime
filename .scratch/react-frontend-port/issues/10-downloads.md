# 10: Downloads from a URL

**What to build:** Paste a video or playlist URL and have its audio added to the library, optionally tagged on arrival so new material is filed without a second pass. A running job shows live progress, and each finished track appears as it completes — so a job that dies partway still leaves everything it managed to fetch.

**Blocked by:** 03

**Status:** wontfix

- [ ] A URL can be submitted from a form that stays collapsed until asked for
- [ ] Tags can be applied at download time and land on every track the job produces
- [ ] A playlist URL can be fetched as a single track or as the whole playlist, chosen explicitly, so fifty items are never pulled by accident
- [ ] A running job shows live progress
- [ ] Each finished track appears in the library as it completes, not only when the whole job finishes
- [ ] A failed download surfaces the reason, so it is clear whether to retry
- [ ] The browser extension's existing flow continues to work untouched, with no CORS middleware and no token endpoint added
- [ ] Tests cover: starting a job and polling it; finished tracks appearing progressively; a failure surfacing its reason

## Comments

2026-09-10 — wontfix. Downloads are only ever started from the Chrome extension
(`extension/`), which talks straight to `POST /api/download`; the in-app URL form is
unused. The backend stays. Consequence: the React client has no job-progress view, so
tracks the extension registers show up on the next library refresh, not live.
