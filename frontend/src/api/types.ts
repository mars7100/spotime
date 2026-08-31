/* The shapes the API actually returns.
   Playback position is the app's defining behaviour, so it is spelled out in the
   type system rather than left to discipline: `media_type` discriminates, and a
   music record's `state` is `null` — not optional, not maybe-null — so reading a
   position off a song is a compile error. The server enforces the same rule in
   `_keeps_state` (backend/main.py); this mirrors it, it does not replace it. */

export interface PlaybackState {
  media_id: string;
  position_seconds: number;
  playback_speed: number;
  completed: boolean;
  updated_at?: string;
}

export interface Chapter {
  title: string;
  start_seconds: number;
}

interface BaseRecord {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  /** Null on records that predate upload-time duration extraction. */
  duration_seconds: number | null;
  storage_path: string;
  artwork_path: string | null;
  original_filename: string | null;
  tags: string[];
  book_id: string | null;
  book_title: string | null;
  track_number: number | null;
  chapters: Chapter[] | null;
  created_at: string;
}

/** A song. Never carries a position: every play starts at zero. */
export interface MusicRecord extends BaseRecord {
  media_type: "music";
  state: null;
}

/** An audiobook, or one chapter file of one. Resumes where you stopped. */
export interface AudiobookRecord extends BaseRecord {
  media_type: "audiobook";
  state: PlaybackState | null;
}

export type MediaRecord = MusicRecord | AudiobookRecord;

export const keepsState = (item: MediaRecord): item is AudiobookRecord =>
  item.media_type === "audiobook";
