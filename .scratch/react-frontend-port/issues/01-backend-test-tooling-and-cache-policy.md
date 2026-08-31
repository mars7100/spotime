# 01: Backend test tooling and path-aware static cache policy

**What to build:** The server's static cache policy currently tells the browser to revalidate every non-API response, which was right while filenames were stable. A hashed-filename build needs the opposite for assets: hashed asset files should be cached long-lived and immutable, while the entry HTML must keep revalidating so a new deploy is picked up on the next load. Get this backwards and the app serves code nobody can see; get it half-right and it serves code nobody can escape.

This ticket also introduces the repo's first automated tests, establishing the pattern later tickets follow.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] Requests for hashed asset paths receive a long-lived, immutable cache directive
- [x] Requests for the entry HTML receive a revalidating directive
- [x] API responses are unaffected by the static cache policy
- [x] The existing vanilla client is still served correctly and the app runs exactly as before
- [x] A test runner is configured for the Python side and runs from a documented command
- [x] Tests cover the three header cases above by exercising the app over HTTP
- [x] Tests point the data-directory environment variable at a temporary directory, so they never touch the real data directory that the reset target wipes

## Comments

**2026-08-31 — agent:** Implemented. `cache_static` in `backend/main.py` replaces `revalidate_static`: paths matching `^/assets/.+-<8+ hash>.<ext>$` get `public, max-age=31536000, immutable`, every other non-API path gets `no-cache`, `/api/*` is untouched. Test tooling is pytest + `httpx` in a `dev` dependency group, `pythonpath = ["."]` so `backend` imports as it does under uvicorn, and `make test` runs it. `tests/conftest.py` redirects `SPOTIME_DATA_DIR` **and** the new `SPOTIME_FRONTEND_DIR` to a temp tree at conftest import — `backend/config.py` resolves both at import time — and serves a fixture entry HTML plus a hashed and an unhashed asset. `tests/test_static_cache.py` covers all four cases. Verified over HTTP against a real build too.
