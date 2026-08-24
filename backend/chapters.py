"""Chapter extraction via ffprobe.

Works on a local path or a signed HTTP(S) URL — ffprobe range-fetches only the
container metadata (the moov atom), so we never download the whole audiobook.
Returns [] on any failure (missing ffprobe, no chapters, network error), which
is the correct behaviour: chapters are a nice-to-have, never fatal to an upload.
"""
import json
import subprocess
from typing import Optional

_TIMEOUT_SECONDS = 90


def extract_chapters(source: str, timeout: int = _TIMEOUT_SECONDS) -> list[dict]:
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_chapters", source],
            capture_output=True, text=True, timeout=timeout,
        )
        data = json.loads(proc.stdout or "{}")
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        return []

    chapters: list[dict] = []
    for ch in data.get("chapters", []):
        start = _to_float(ch.get("start_time"))
        if start is None:
            continue
        title = (ch.get("tags") or {}).get("title") or f"Chapter {len(chapters) + 1}"
        chapters.append({"title": title, "start_seconds": start})
    # ffprobe usually returns them in order, but don't rely on it.
    chapters.sort(key=lambda c: c["start_seconds"])
    return chapters


def _to_float(v) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
