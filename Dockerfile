# The frontend is built here, in its own stage, so a deploy can never ship a
# stale bundle. Nothing from this stage reaches the runtime image except dist/.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim

WORKDIR /app

# ffprobe (from ffmpeg) extracts audiobook chapters over HTTP range requests;
# ffmpeg also transcodes downloads to mp3. Node solves the JS challenges YouTube
# throws at yt-dlp — without it downloads often fail on datacenter IPs.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv, then dependencies from the locked set (no dev deps).
# --compile-bytecode matters on Cloud Run: uv skips .pyc by default, so without
# it every cold-started instance recompiles the whole dependency tree before
# serving (measured ~1.7s vs ~0.35s to import backend.main).
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --compile-bytecode

# App code. Only the built client ships — no sources, no node_modules. The
# `nodejs` installed above is for yt-dlp's JS challenges and is never used to
# build the frontend.
COPY backend/ backend/
COPY --from=web /web/dist/ frontend/dist/
COPY frontend/legacy/ frontend/legacy/

# Cloud Run injects $PORT (defaults to 8080). Bind to it.
ENV PORT=8080
CMD ["sh", "-c", ".venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
