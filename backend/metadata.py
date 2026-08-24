"""Audio metadata extraction using Mutagen.

Pulls title/artist/album/duration and embedded cover art. Falls back to the
filename for the title when tags are missing (per spec section 9).
"""
from pathlib import Path
from typing import Optional

from mutagen import File as MutagenFile
from mutagen.id3 import APIC
from mutagen.mp4 import MP4Cover

# Audiobook containers default to the audiobook media type.
AUDIOBOOK_EXTS = {".m4b"}


def guess_media_type(filename: str) -> str:
    return "audiobook" if Path(filename).suffix.lower() in AUDIOBOOK_EXTS else "music"


def _first_tag(tags, keys) -> Optional[str]:
    for k in keys:
        val = tags.get(k)
        if val:
            return str(val[0]) if isinstance(val, list) else str(val)
    return None


def _extract_cover(audio) -> Optional[bytes]:
    # ID3 (mp3): APIC frames.
    try:
        for frame in audio.tags.values():
            if isinstance(frame, APIC):
                return frame.data
    except AttributeError:
        pass
    # MP4 (m4a/m4b): 'covr' atom.
    try:
        covers = audio.tags.get("covr")
        if covers:
            return bytes(covers[0])
    except (AttributeError, TypeError):
        pass
    return None


def extract(file_path: Path, original_filename: str) -> dict:
    fallback_title = Path(original_filename).stem
    result = {
        "title": fallback_title,
        "artist": None,
        "album": None,
        "duration_seconds": None,
        "media_type": guess_media_type(original_filename),
        "cover_bytes": None,
    }

    audio = MutagenFile(file_path)
    if audio is None:
        return result

    if audio.info is not None:
        result["duration_seconds"] = getattr(audio.info, "length", None)

    tags = audio.tags
    if tags:
        # Try both ID3 frame keys and MP4/vorbis-style keys.
        result["title"] = _first_tag(tags, ["TIT2", "title", "\xa9nam"]) or fallback_title
        result["artist"] = _first_tag(tags, ["TPE1", "artist", "\xa9ART", "TCOM"])
        result["album"] = _first_tag(tags, ["TALB", "album", "\xa9alb"])
        result["cover_bytes"] = _extract_cover(audio)

    return result
