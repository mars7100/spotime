/* Operating-system media controls — the lock screen, the keyboard's play key,
   the macOS Now Playing widget.

   Every handler routes through the player's own commands rather than touching
   the element directly. An OS pause and the pause button must be the *same*
   action, or the two can end up disagreeing about what is playing; the provider
   stays the only thing that touches the element.

   Every call is guarded twice over. Support is partial and uneven: a browser
   may expose `mediaSession` without `MediaMetadata`, and `setActionHandler`
   throws for an action it does not implement rather than ignoring it — so one
   unsupported action must not take the rest of the handlers down with it. */
import { useEffect, useRef } from "react";
import type { MediaRecord } from "../api/types";
import type { BookSession, PlayerCommands } from "./PlayerProvider";

/** Skip amounts for the OS buttons, matching the bar's own audiobook controls:
    back a missed sentence, forward past an ad. */
const BACK_SECONDS = 15;
const FORWARD_SECONDS = 30;

const session = (): MediaSession | null =>
  typeof navigator !== "undefined" && "mediaSession" in navigator
    ? navigator.mediaSession
    : null;

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
  try {
    session()?.setActionHandler(action, handler);
  } catch {
    /* This browser does not offer the action. */
  }
}

/** What the operating system needs to describe and control what is playing. */
export interface NowPlayingSummary {
  current: MediaRecord | null;
  book: BookSession | null;
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
}

export function useMediaSession(now: NowPlayingSummary, commands: PlayerCommands): void {
  const { current, book, playing, position, duration, speed } = now;

  /* Handlers are registered once and read the commands through this, so a new
     commands object does not churn the OS's registration — and the handler the
     lock screen holds is never a stale closure. */
  const latest = useRef(commands);
  latest.current = commands;

  useEffect(() => {
    const ms = session();
    if (!ms) return;

    setHandler("play", () => latest.current.toggle());
    setHandler("pause", () => latest.current.toggle());
    setHandler("previoustrack", () => latest.current.previous());
    setHandler("nexttrack", () => latest.current.next());
    setHandler("seekbackward", (details) =>
      latest.current.nudge(-(details.seekOffset || BACK_SECONDS)),
    );
    setHandler("seekforward", (details) =>
      latest.current.nudge(details.seekOffset || FORWARD_SECONDS),
    );
    setHandler("seekto", (details) => {
      if (details.seekTime != null) latest.current.seek(details.seekTime);
    });

    return () => {
      for (const action of [
        "play",
        "pause",
        "previoustrack",
        "nexttrack",
        "seekbackward",
        "seekforward",
        "seekto",
      ] as const)
        setHandler(action, null);
    };
  }, []);

  /* What the OS shows. A folder book is one book, labelled the way the bar
     labels it: the book is the album and the chapter is the track. */
  useEffect(() => {
    const ms = session();
    if (!ms) return;
    if (!current) {
      ms.metadata = null;
      return;
    }
    if (typeof MediaMetadata === "undefined") return;

    const artworkId = book ? book.artworkId : current.artwork_path ? current.id : null;
    ms.metadata = new MediaMetadata({
      title: book ? current.title || `Chapter ${book.index + 1}` : current.title,
      artist: (book ? book.artist : current.artist) || "Unknown",
      album: (book ? book.title : current.album) || "",
      artwork: artworkId ? [{ src: `/api/media/${artworkId}/artwork`, sizes: "512x512" }] : [],
    });
  }, [current, book]);

  // Whether the OS draws a play button or a pause button.
  useEffect(() => {
    const ms = session();
    if (!ms) return;
    ms.playbackState = !current ? "none" : playing ? "playing" : "paused";
  }, [current, playing]);

  /* The scrubber on the lock screen. Nothing to report until the element knows
     its duration, and a position past the end throws rather than clamping. */
  useEffect(() => {
    const ms = session();
    if (!ms?.setPositionState) return;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      ms.setPositionState({
        duration,
        playbackRate: speed,
        position: Math.min(Math.max(0, position), duration),
      });
    } catch {
      /* A rejected position state is cosmetic; playback carries on. */
    }
  }, [position, duration, speed]);
}
