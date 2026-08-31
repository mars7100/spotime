import { useState } from "react";
import { IconBook, IconMusic } from "./icons";

interface Props {
  /** The media id whose artwork to fetch, or null when there is none. */
  mediaId: string | null;
  kind: "music" | "audiobook";
  size?: number;
  alt?: string;
}

/** Cover art, falling back to a quiet tile — most records carry no artwork, and
    a broken-image glyph in every row would be louder than the titles. */
export function CoverArt({ mediaId, kind, size = 42, alt = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (!mediaId || failed) {
    return (
      <span className="art art--empty" style={style} aria-hidden>
        {kind === "audiobook" ? <IconBook size={size * 0.42} /> : <IconMusic size={size * 0.42} />}
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
