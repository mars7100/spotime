import { useState } from "react";
import { IconBook, IconMusic } from "./icons";

interface Props {
  /** The media id whose artwork to fetch, or null when there is none. */
  mediaId: string | null;
  kind: "music" | "audiobook";
  /** A pixel box, or any CSS length for art that should scale with the view.
      The size is inline rather than a class because it is per-use, and an
      inline style is what a stylesheet rule could not override anyway. */
  size?: number | string;
  alt?: string;
}

/** Cover art, falling back to a quiet tile — most records carry no artwork, and
    a broken-image glyph in every row would be louder than the titles. */
export function CoverArt({ mediaId, kind, size = 42, alt = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  // The placeholder glyph is sized off the tile; a fluid tile has no number to
  // scale from, so it gets one that suits the large art it stands in for.
  const glyph = typeof size === "number" ? size * 0.42 : 72;

  if (!mediaId || failed) {
    return (
      <span className="art art--empty" style={style} aria-hidden>
        {kind === "audiobook" ? <IconBook size={glyph} /> : <IconMusic size={glyph} />}
      </span>
    );
  }
  return (
    <img
      className="art"
      style={style}
      src={`/api/media/${mediaId}/artwork`}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
