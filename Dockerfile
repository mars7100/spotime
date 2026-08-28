FROM python:3.12-slim

WORKDIR /app

# ffprobe (from ffmpeg) extracts audiobook chapters over HTTP range requests;
# ffmpeg also transcodes downloads to mp3. Node solves the JS challenges YouTube
# throws at yt-dlp — without it downloads often fail on datacenter IPs.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv, then dependencies from the locked set (no dev deps).
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# App code.
COPY backend/ backend/
COPY frontend/ frontend/

# Cloud Run injects $PORT (defaults to 8080). Bind to it.
ENV PORT=8080
CMD ["sh", "-c", ".venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
