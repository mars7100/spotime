# 02: React scaffold and build pipeline

**What to build:** Visiting the app shows a React shell rendered in the new warm-dark identity — the palette, the three type roles, and the vector icon set all wired and visible. The developer gets one command that runs the API and a hot-reloading frontend together. The container image builds the frontend itself, so a deploy cannot ship a stale build.

This is the **expand** half of an expand–contract sequence. The vanilla client stays in the repo and stays reachable at a legacy path, so Spotime remains fully usable while the React app is filled in over the following tickets. Ticket 14 contracts.

**Blocked by:** 01

**Status:** ready-for-human

- [x] The app is a React and TypeScript project built by a bundler, client-rendered, with no server rendering and no router
- [x] The build emits content-hashed assets, and the server serves the build output
- [x] Design tokens exist as custom properties: warm near-black ground, two raised warm surfaces, hairline border, warm off-white text, warm muted grey, amber accent. No value from the old palette survives
- [x] The three type roles are loaded and applied: a serif display face reserved for the wordmark, a sans face for interface text, a monospaced face for times and counts
- [x] A vector icon set is available as components at a consistent size and stroke weight
- [x] One development command starts the API and the frontend together, with the API proxied so the browser sees a single origin, and hot reload works
- [x] The existing Firestore and full-cloud development targets keep their current environment-variable shapes and gain the same treatment
- [x] The login page is copied into the build output verbatim at its current path, carries no framework, and still gates access on the deployed app
- [x] The container image builds the frontend in its own dedicated Node stage; only the built output reaches the runtime image
- [x] The Node already present in the runtime image for the downloader's JS challenges is not reused for the build
- [x] The vanilla client remains reachable at a legacy path and remains fully functional

## Comments

**2026-08-31 — agent:** Implemented. `frontend/` is now the Vite + React + TS project (`src/`, no router, no SSR) building to `frontend/dist`; the vanilla client moved to `frontend/legacy/` and is mounted at `/legacy`, fully working (its three asset refs were made relative). `login.html` moved to `frontend/public/` and is copied verbatim into the build at `/login.html`. Tokens are the mockup's palette verbatim in `src/styles/tokens.css`; fonts are self-hosted via `@fontsource` (Instrument Sans / Instrument Serif / JetBrains Mono) rather than Google's CDN; icons are lucide-react bound to one size and stroke in `src/ui/icons.tsx`. `make dev` / `dev-firestore` / `cloud` each run uvicorn + Vite together with `/api` and `/legacy` proxied (browse :5173); env shapes unchanged. The Dockerfile gained a `node:22-slim AS web` stage — only `dist/` reaches the runtime image, whose apt `nodejs` is still yt-dlp's alone. `App.tsx` is a scaffold shell (palette, icons, type specimens) that ticket 03 replaces.
