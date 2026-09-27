/* The provider: the element's events in, commands out.
   Components render from the state mirrored here and send commands through
   `usePlayerCommands`. Nothing outside this file touches the element.

   State is split across three contexts on purpose. `position` changes four
   times a second; if the library rows read the same context as the scrubber,
   every row in the list would re-render on every tick. So rows subscribe to
   `useNowPlaying` (which id, playing or not) and the player bar to the rest. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPlayUrl, getState, putState } from "../api/client";
import { keepsState, type AudiobookRecord, type MediaRecord } from "../api/types";
import { audio, loadSource } from "./audio";
import {
  chapterIndexAt,
  chaptersOfBook,
  chaptersOfFile,
  type ChapterEntry,
} from "./chapters";
import { useMediaSession } from "./mediaSession";
import { buildQueue, stepFrom } from "./queue";

/** A folder book, as the library hands it over: enough to play it and to label
    it, and nothing about how the library drew the row. */
export interface BookRef {
  id: string;
  title: string;
  artist: string | null;
  artworkId: string | null;
  tracks: AudiobookRecord[];
}

/** A folder book being listened to, and which of its chapters is loaded.
    Null whenever a standalone track is playing — playing anything else leaves
    book mode, so "am I in a book" is never inferred from the record. */
export interface BookSession extends BookRef {
  index: number;
}

export interface PlayerState {
  current: MediaRecord | null;
  playing: boolean;
  position: number;
  /** From the element once known, 0 before then. */
  duration: number;
  speed: number;
  volume: number;
  shuffle: boolean;
  /** Set when a play could not be started, cleared by the next successful one. */
  error: string | null;
  /** The folder book being listened to, or null for a standalone track. */
  book: BookSession | null;
  /** Something worth saying out loud — the end of a book, so the silence that
      follows is explained. Cleared by the next play. */
  notice: string | null;
}

export interface PlayerCommands {
  /** `view`, when given, is what was in view when the song was clicked — it
      becomes the queue, captured at that moment rather than tracking whatever
      the library is filtered to later. Omitted for a single-file audiobook,
      which has no queue to capture. */
  play(item: MediaRecord, view?: MediaRecord[]): void;
  /** Open a folder book at one of its chapters; playback then runs on from
      there, chapter to chapter. */
  playBook(book: BookRef, index: number): void;
  /** Seconds relative to the current position; audiobook skip controls. */
  nudge(seconds: number): void;
  toggle(): void;
  seek(seconds: number): void;
  next(): void;
  previous(): void;
  setSpeed(rate: number): void;
  setVolume(level: number): void;
  toggleShuffle(): void;
  /** These records were deleted. If one of them is playing, playback stops —
      the bytes may still be cached, but the thing they belonged to is gone.
      Either way they are dropped from the queue, so a deleted track is never
      stepped to. */
  forget(ids: string[]): void;
}

export interface NowPlaying {
  id: string | null;
  playing: boolean;
}

/** The chapter list, and where in it playback is. Its own context because it
    changes when the chapter changes — not four times a second like `position`,
    which is what deciding the current chapter is derived from. */
export interface ChaptersView {
  entries: ChapterEntry[];
  /** -1 when nothing is playing, or before the first mark. */
  currentIndex: number;
  select(index: number): void;
}

const StateContext = createContext<PlayerState | null>(null);
const CommandsContext = createContext<PlayerCommands | null>(null);
const NowPlayingContext = createContext<NowPlaying>({ id: null, playing: false });
const ChaptersContext = createContext<ChaptersView>({
  entries: [],
  currentIndex: -1,
  select: () => {},
});

/** Spec §7: the position is written back about every fifteen seconds, so a
    crash costs seconds rather than an hour. */
const SAVE_EVERY_MS = 15_000;

/** Below this, a saved position is noise from a mis-tap, not a place to resume. */
const RESUME_FLOOR_SECONDS = 5;

const SHUFFLE_KEY = "spotime_shuffle";
const VOLUME_KEY = "spotime_volume";

/** localStorage is unavailable in some privacy modes; a lost preference is not
    worth a crashed player. */
const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<MediaRecord | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [volume, setVolumeState] = useState(() => Number(stored(VOLUME_KEY) ?? 1));
  const [shuffle, setShuffle] = useState(() => stored(SHUFFLE_KEY) === "1");
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<BookSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [source, setSource] = useState<MediaRecord[]>([]);
  const [queue, setQueue] = useState<MediaRecord[]>([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentRef = useRef(current);
  currentRef.current = current;
  const bookRef = useRef(book);
  bookRef.current = book;

  /* Only the newest play may touch the element: clicking three rows quickly
     must leave the third one playing, not whichever request answered last. */
  const request = useRef(0);
  /* The next song's play URL, fetched while this one plays. On `ended` the
     handoff must be synchronous: a phone with its screen locked throttles the
     page, and a `play()` that arrives after a network round-trip is refused.
     ponytail: signed URLs live 60 min; a song longer than that refetches on a
     failed load rather than being guarded against here. */
  const prefetched = useRef<{ id: string; url: string } | null>(null);
  const endedRef = useRef<(item: MediaRecord) => void>(() => {});

  // Mirror the element's events into state. Registered once, for the life of
  // the app — the element never goes away, so neither do these.
  useEffect(() => {
    const listeners = new AbortController();
    const on = (type: string, handler: () => void) =>
      audio.addEventListener(type, handler, { signal: listeners.signal });
    const readDuration = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);

    on("play", () => setPlaying(true));
    on("playing", () => setPlaying(true));
    on("pause", () => setPlaying(false));
    on("timeupdate", () => setPosition(audio.currentTime));
    on("seeked", () => setPosition(audio.currentTime));
    on("durationchange", readDuration);
    on("loadedmetadata", readDuration);
    on("ratechange", () => setSpeedState(audio.playbackRate));
    on("volumechange", () => setVolumeState(audio.volume));
    return () => listeners.abort();
  }, []);

  // The element, not React, owns volume; keep it in step with the preference.
  useEffect(() => {
    audio.volume = volume;
  }, [volume]);

  // The queue is the list captured at the last song click; re-rolled when
  // shuffle changes.
  useEffect(() => {
    setQueue(buildQueue(source, { shuffle, pin: currentRef.current?.id ?? null }));
  }, [source, shuffle]);

  // Whatever will follow the current song has its URL fetched now, and again
  // whenever the queue changes underneath it. Songs only: a book never
  // auto-advances to a song, and a chapter reads its saved state on entry.
  useEffect(() => {
    if (!current || keepsState(current)) return;
    const next = stepFrom(queue, current.id, 1);
    if (!next || keepsState(next) || prefetched.current?.id === next.id) return;
    let live = true;
    getPlayUrl(next.id)
      .then(({ url }) => {
        if (live) prefetched.current = { id: next.id, url };
      })
      .catch(() => {
        /* The handoff then takes the slow path, as before. */
      });
    return () => {
      live = false;
    };
  }, [current, queue]);

  /* Position saving. Audiobooks only — a song carries no position at all, so
     there is nothing to flush on pause, seek, tab-hide or track change. The
     server enforces the same rule in `_keeps_state`; this is not a second
     opinion, it is not asking in the first place. */
  const saveNow = useCallback(
    (extra: { completed?: boolean } = {}, options?: { keepalive?: boolean }) => {
      const item = currentRef.current;
      if (!item || !keepsState(item)) return;
      /* Nothing has loaded yet, so `currentTime` is 0 because there is no
         audio, not because the listener is at the start. Saving here writes a
         zero over a real position — the one failure this whole feature exists
         to prevent. */
      if (!Number.isFinite(audio.duration)) return;
      void putState(
        item,
        {
          position_seconds: audio.currentTime || 0,
          playback_speed: audio.playbackRate,
          ...extra,
        },
        options,
      ).catch(() => {
        /* A dropped save costs one interval, not the session. */
      });
    },
    [],
  );

  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopSaving = useCallback(() => {
    if (saveTimer.current !== null) clearInterval(saveTimer.current);
    saveTimer.current = null;
  }, []);

  // Saving is driven by the element's own play/pause, not by a command: however
  // playback started or stopped — a lock-screen button, an autoplay rejection —
  // the timer follows what is actually happening.
  useEffect(() => {
    const listeners = new AbortController();
    audio.addEventListener(
      "play",
      () => {
        stopSaving();
        saveTimer.current = setInterval(() => {
          if (!audio.paused) saveNow();
        }, SAVE_EVERY_MS);
      },
      { signal: listeners.signal },
    );
    audio.addEventListener(
      "pause",
      () => {
        stopSaving();
        saveNow();
      },
      { signal: listeners.signal },
    );
    return () => {
      listeners.abort();
      stopSaving();
    };
  }, [saveNow, stopSaving]);

  // Leaving the page is the moment a lost position hurts most, and on a phone
  // it is the *only* moment: a backgrounded tab may never run code again.
  useEffect(() => {
    const listeners = new AbortController();
    const flush = () => saveNow({}, { keepalive: true });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") flush();
      },
      { signal: listeners.signal },
    );
    window.addEventListener("pagehide", flush, { signal: listeners.signal });
    return () => listeners.abort();
  }, [saveNow]);

  /* `session` is what makes a chapter part of a book rather than a track that
     happens to be playing: passing null leaves book mode, so nothing has to
     guess from the record whether the next chapter should follow. `resume` is
     false only for an auto-advance, where the listener has arrived at the top
     of a chapter and any saved position in it is from an earlier pass. */
  const play = useCallback(
    async (
      item: MediaRecord,
      session: BookSession | null = null,
      options: { resume?: boolean } = {},
    ) => {
      // Flush the outgoing book before its record is replaced.
      if (currentRef.current && currentRef.current.id !== item.id) saveNow();

      const token = (request.current += 1);
      setCurrent(item);
      setBook(session);
      setNotice(null);
      setPosition(0);
      setDuration(item.duration_seconds ?? 0);

      let url: string;
      let resumeAt = 0;
      /* Speed belongs to a book, not to the session: a song plays at 1× unless
         you change it, exactly as the vanilla client behaved. */
      let speedFor = 1;
      const ready = prefetched.current;
      if (ready && ready.id === item.id && !keepsState(item)) {
        // No await on this path — see `prefetched`.
        url = ready.url;
      } else try {
        /* The saved position is read fresh rather than taken from the library
           payload, which may be minutes old or written by another device. A
           song is never asked about: `keepsState` is the type-level half of the
           server's rule, so this branch is checked at compile time. */
        const [playInfo, state] = await Promise.all([
          getPlayUrl(item.id),
          keepsState(item) ? getState(item) : Promise.resolve(null),
        ]);
        url = playInfo.url;
        if (state) {
          resumeAt =
            state.completed || options.resume === false ? 0 : state.position_seconds || 0;
          speedFor = state.playback_speed || 1;
        }
      } catch (err: unknown) {
        if (token === request.current) {
          setError(`Couldn’t play “${item.title}”: ${err instanceof Error ? err.message : "failed"}`);
        }
        return;
      }
      if (token !== request.current) return; // a newer click won

      setError(null);
      const resuming = resumeAt > RESUME_FLOOR_SECONDS;
      loadSource(item.id, url, {
        onEnded: () => endedRef.current(item),
        onLoaded: resuming
          ? () => {
              // A media element cannot be seeked before it knows its duration,
              // and seeking to the very end would land on instant silence.
              const limit = Number.isFinite(audio.duration) ? audio.duration - 1 : Infinity;
              if (resumeAt < limit) {
                audio.currentTime = resumeAt;
                setPosition(resumeAt);
              }
            }
          : undefined,
      });
      /* Speed is applied *after* the source, never before: assigning `src`
         starts the media load algorithm, which resets `playbackRate` to
         `defaultPlaybackRate`. Setting the default too makes the book's pace
         survive the load rather than snapping back to 1×. */
      audio.defaultPlaybackRate = speedFor;
      audio.playbackRate = speedFor;
      setSpeedState(speedFor);
      /* Every load starts at zero — every song, every time, and a book with
         nothing worth resuming to. A resume moves forward from here, once the
         element knows its duration. */
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* Autoplay policies reject a play the user did not gesture for; the
           element stays paused and the button reflects that. */
      });
    },
    [saveNow],
  );

  /* Step on from the track that *finished*, never from "what is playing now".
     Those differ for exactly as long as a track change is in flight, which is
     precisely when a late `ended` arrives — stepping from the incoming track
     there would skip the song the listener just picked. Binding the record at
     the call site is what makes that impossible to get wrong. */
  const finished = useCallback(
    (item: MediaRecord) => {
      stopSaving();
      const session = bookRef.current;
      const at = session ? session.tracks.findIndex((t) => t.id === item.id) : -1;
      if (session && at !== -1) {
        // A chapter of a folder book: mark it done and run on into the next
        // one, so a book plays through the way a single file would.
        saveNow({ completed: true });
        const following = session.tracks[at + 1];
        if (following) void play(following, { ...session, index: at + 1 }, { resume: false });
        else setNotice("Finished — that was the last chapter.");
        return;
      }
      if (keepsState(item)) {
        // A book that played out is done; the library marks it finished and a
        // reopen starts from the beginning rather than the last second.
        saveNow({ completed: true });
        setNotice("Finished — you’ve reached the end of the book.");
        return;
      }
      const next = stepFrom(queueRef.current, item.id, 1);
      if (next) void play(next);
    },
    [play, saveNow, stopSaving],
  );
  endedRef.current = finished;

  const forget = useCallback((ids: string[]) => {
    setSource((s) => (s.some((it) => ids.includes(it.id)) ? s.filter((it) => !ids.includes(it.id)) : s));

    const item = currentRef.current;
    if (!item || !ids.includes(item.id)) return;
    // Cleared before the pause so its save handler has nothing to write for a
    // record that no longer exists; the bumped token orphans any play in flight.
    currentRef.current = null;
    request.current += 1;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setCurrent(null);
    setBook(null);
    setNotice(null);
    setPosition(0);
    setDuration(0);
  }, []);

  const commands = useMemo<PlayerCommands>(
    () => ({
      play: (item, view) => {
        if (view) setSource(view);
        void play(item);
      },
      playBook: (target, index) => {
        const at = Math.min(Math.max(0, index), target.tracks.length - 1);
        const track = target.tracks[at];
        if (track) void play(track, { ...target, index: at });
      },
      toggle: () => {
        if (!currentRef.current) return;
        if (audio.paused) void audio.play().catch(() => {});
        else audio.pause();
      },
      seek: (seconds) => {
        audio.currentTime = Math.max(0, seconds);
        setPosition(audio.currentTime);
        saveNow();
      },
      nudge: (seconds) => {
        const limit = Number.isFinite(audio.duration) ? audio.duration : Infinity;
        audio.currentTime = Math.min(limit, Math.max(0, audio.currentTime + seconds));
        setPosition(audio.currentTime);
        saveNow();
      },
      next: () => {
        const session = bookRef.current;
        if (session) {
          const following = session.tracks[session.index + 1];
          if (following) void play(following, { ...session, index: session.index + 1 });
          return;
        }
        const cur = currentRef.current;
        const next = cur && stepFrom(queueRef.current, cur.id, 1);
        if (next) void play(next);
      },
      previous: () => {
        // Standard media-player behaviour: past three seconds, "previous"
        // restarts the current track rather than leaving it.
        if (audio.currentTime > 3) {
          audio.currentTime = 0;
          setPosition(0);
          saveNow();
          return;
        }
        const session = bookRef.current;
        if (session) {
          const preceding = session.tracks[session.index - 1];
          if (preceding) void play(preceding, { ...session, index: session.index - 1 });
          return;
        }
        const cur = currentRef.current;
        const prev = cur && stepFrom(queueRef.current, cur.id, -1);
        if (prev) void play(prev);
      },
      setSpeed: (rate) => {
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;
        setSpeedState(rate);
        // Speed is persisted alongside the position, so a book reopens at the
        // pace you were listening at.
        saveNow();
      },
      setVolume: (level) => {
        const clamped = Math.min(1, Math.max(0, level));
        audio.volume = clamped;
        setVolumeState(clamped);
        store(VOLUME_KEY, String(clamped));
      },
      toggleShuffle: () =>
        setShuffle((on) => {
          store(SHUFFLE_KEY, on ? "0" : "1");
          return !on;
        }),
      forget,
    }),
    [play, saveNow, forget],
  );

  const state = useMemo<PlayerState>(
    () => ({ current, playing, position, duration, speed, volume, shuffle, error, book, notice }),
    [current, playing, position, duration, speed, volume, shuffle, error, book, notice],
  );

  const entries = useMemo(
    () => (book ? chaptersOfBook(book.tracks) : chaptersOfFile(current)),
    [book, current],
  );

  /* Two sources, two ways of being "in" a chapter: in a folder book it is
     whichever file is loaded, in a single file whichever mark the playhead has
     gone past. */
  const chapterIndex = book ? book.index : chapterIndexAt(entries, position);

  const selectChapter = useCallback(
    (index: number) => {
      const session = bookRef.current;
      if (session) {
        const track = session.tracks[index];
        if (track) void play(track, { ...session, index });
        return;
      }
      const start = entries[index]?.startSeconds;
      if (start == null) return;
      audio.currentTime = start;
      setPosition(start);
      saveNow();
    },
    [entries, play, saveNow],
  );

  const chapters = useMemo<ChaptersView>(
    () => ({ entries, currentIndex: chapterIndex, select: selectChapter }),
    [entries, chapterIndex, selectChapter],
  );

  const nowPlaying = useMemo<NowPlaying>(
    () => ({ id: current?.id ?? null, playing }),
    [current?.id, playing],
  );

  /* The lock screen, the keyboard's play key, the macOS Now Playing widget.
     It reads the same mirrored state the bar renders from and issues the same
     commands the bar's buttons do, so an OS pause and a clicked pause are one
     action rather than two that have to be kept in agreement. */
  useMediaSession({ current, book, playing, position, duration, speed }, commands);

  return (
    <CommandsContext.Provider value={commands}>
      <NowPlayingContext.Provider value={nowPlaying}>
        <ChaptersContext.Provider value={chapters}>
          <StateContext.Provider value={state}>{children}</StateContext.Provider>
        </ChaptersContext.Provider>
      </NowPlayingContext.Provider>
    </CommandsContext.Provider>
  );
}

export function usePlayerState(): PlayerState {
  const value = useContext(StateContext);
  if (!value) throw new Error("usePlayerState outside PlayerProvider");
  return value;
}

export function usePlayerCommands(): PlayerCommands {
  const value = useContext(CommandsContext);
  if (!value) throw new Error("usePlayerCommands outside PlayerProvider");
  return value;
}

/** What a library row needs, and nothing that ticks. */
export const useNowPlaying = (): NowPlaying => useContext(NowPlayingContext);

/** The chapter list and the chapter you are in. */
export const useChapters = (): ChaptersView => useContext(ChaptersContext);
