/* The player: three columns — now-playing metadata, transport with the scrubber
   beneath it, and secondary controls. Every control is a vector icon; the old
   client's emoji and box-drawing glyphs are gone.

   This renders *from* the element and sends commands *to* it. It owns no
   playback state.

   The full-screen now-playing view is this same footer re-flowed — one class,
   one set of controls, one React element in one place in the tree, so the node
   is never unmounted and there is no second player that could disagree with
   this one about what is playing. */
import { useEffect, useState } from "react";
import { Chapters } from "./Chapters";
import { CoverArt } from "../../ui/CoverArt";
import { formatTime } from "../../lib/format";
import {
  IconBack15,
  IconCollapse,
  IconForward30,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconShuffle,
  IconSpeed,
  IconVolumeHigh,
  IconVolumeLow,
  IconVolumeMute,
} from "../../ui/icons";
import { usePlayerCommands, usePlayerState } from "../../player/PlayerProvider";
import "./player.css";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** The art fills the view rather than a fixed box, so it is large on a desktop
    and does not overflow a phone. */
const HERO_ART = "min(70vw, 340px)";

export function PlayerBar() {
  const { current, playing, position, duration, speed, volume, shuffle, error, book, notice } =
    usePlayerState();
  const { toggle, seek, nudge, next, previous, setSpeed, setVolume, toggleShuffle } =
    usePlayerCommands();
  const [expanded, setExpanded] = useState(false);

  // Escape collapses, the way it dismisses anything that covers the page.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (!current) return null;

  /* Skipping by a fixed amount is an audiobook gesture — a missed sentence, a
     skipped ad. On a three-minute song it is just a worse scrubber, so music
     does not get the buttons. */
  const isBook = current.media_type === "audiobook";

  // The element's duration once it has metadata; the record's until then, so
  // the total does not sit at 0:00 while the file loads.
  const total = duration || current.duration_seconds || 0;
  /* A folder book is one book, not a shuffle of files: the book's name is what
     is playing, and the chapter is where you are in it. */
  const title = book ? book.title : current.title;
  const subtitle = book
    ? `${current.title || `Chapter ${book.index + 1}`} · ${book.index + 1}/${book.tracks.length}`
    : [current.artist, current.album].filter(Boolean).join(" — ");

  return (
    <footer className={`player${expanded ? " player--full" : ""}`} aria-label="Player">
      {expanded && (
        <button
          type="button"
          className="ctl player__collapse"
          aria-label="Collapse player"
          onClick={() => setExpanded(false)}
        >
          <IconCollapse />
        </button>
      )}

      {/* The art and metadata are the way into the full-screen view, and the way
          back out of it — the same gesture both directions. */}
      <button
        type="button"
        className="player__now"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse full-screen player" : "Expand to full screen"}
        onClick={() => setExpanded((was) => !was)}
      >
        <CoverArt
          mediaId={book ? book.artworkId : current.artwork_path ? current.id : null}
          kind={current.media_type}
          size={expanded ? HERO_ART : 52}
        />
        <div className="player__meta">
          <div className="player__title">{title}</div>
          <div className="player__sub">{subtitle || "Unknown"}</div>
        </div>
      </button>

      <div className="player__transport">
        <div className="transport">
          <button type="button" className="ctl" aria-label="Previous track" onClick={previous}>
            <IconPrev />
          </button>
          {isBook && (
            <button
              type="button"
              className="ctl"
              aria-label="Back 15 seconds"
              onClick={() => nudge(-15)}
            >
              <IconBack15 />
            </button>
          )}
          <button
            type="button"
            className="ctl ctl--primary"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
          >
            {playing ? (
              <IconPause size={expanded ? 26 : 20} />
            ) : (
              <IconPlay size={expanded ? 26 : 20} />
            )}
          </button>
          {isBook && (
            <button
              type="button"
              className="ctl"
              aria-label="Forward 30 seconds"
              onClick={() => nudge(30)}
            >
              <IconForward30 />
            </button>
          )}
          <button type="button" className="ctl" aria-label="Next track" onClick={next}>
            <IconNext />
          </button>
        </div>
        <div className="scrub">
          <span className="mono scrub__time">{formatTime(position)}</span>
          <input
            className="scrub__bar"
            type="range"
            aria-label="Seek"
            min={0}
            max={total || 0}
            step={1}
            value={Math.min(position, total || 0)}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="mono scrub__time">{formatTime(total)}</span>
        </div>
      </div>

      <div className="player__aux">
        <Chapters />
        <button
          type="button"
          className={`ctl${shuffle ? " ctl--on" : ""}`}
          aria-label="Shuffle"
          aria-pressed={shuffle}
          onClick={toggleShuffle}
        >
          <IconShuffle />
        </button>

        <label className="aux-field">
          <IconSpeed />
          <span className="visually-hidden">Playback speed</span>
          <select
            className="mono speed"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>

        <div className="aux-field">
          <VolumeIcon level={volume} />
          <input
            className="volume"
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
      </div>

      {error && (
        <p className="player__error" role="status">
          {error}
        </p>
      )}

      {notice && !error && (
        <p className="player__notice" role="status">
          {notice}
        </p>
      )}
    </footer>
  );
}

function VolumeIcon({ level }: { level: number }) {
  if (level === 0) return <IconVolumeMute />;
  return level < 0.5 ? <IconVolumeLow /> : <IconVolumeHigh />;
}
