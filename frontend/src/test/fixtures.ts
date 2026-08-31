/* Library fixtures. Records are written the way the API returns them, so a test
   fails when the payload shape drifts rather than when a component is renamed. */
import type { AudiobookRecord, MediaRecord, MusicRecord, PlaybackState } from "../api/types";

let n = 0;
const id = () => `id${(n += 1)}`;

type SongOver = Partial<Omit<MusicRecord, "media_type" | "state">>;
type BookOver = Partial<Omit<AudiobookRecord, "media_type">>;

export function song(over: SongOver = {}): MusicRecord {
  return {
    id: id(),
    title: "Nightcall",
    artist: "Kavinsky",
    album: "OutRun",
    duration_seconds: 258,
    storage_path: "audio/x.mp3",
    artwork_path: null,
    original_filename: "nightcall.mp3",
    chapters: null,
    tags: [],
    book_id: null,
    book_title: null,
    track_number: null,
    created_at: "2026-08-30T12:00:00Z",
    ...over,
    media_type: "music",
    state: null,
  };
}

export function book(over: BookOver = {}): AudiobookRecord {
  return {
    id: id(),
    title: "Project Hail Mary",
    artist: "Andy Weir",
    album: null,
    duration_seconds: 3600,
    storage_path: "audio/y.m4b",
    artwork_path: null,
    original_filename: "phm.m4b",
    chapters: null,
    tags: [],
    book_id: null,
    book_title: null,
    track_number: null,
    state: null,
    created_at: "2026-08-29T12:00:00Z",
    ...over,
    media_type: "audiobook",
  };
}

export const state = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  media_id: "id1",
  position_seconds: 0,
  playback_speed: 1,
  completed: false,
  ...over,
});

export const library = (...items: MediaRecord[]) => items;
