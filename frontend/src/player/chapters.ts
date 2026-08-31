/* Chapters, as one shape from two very different sources.

   A single-file book carries chapter *marks* — `{title, start_seconds}` read out
   of the container by ffprobe — and jumping to one is a seek. A book uploaded as
   a folder carries no marks at all: each file *is* a chapter, and jumping to one
   loads a different source. The panel should not care which it is looking at, so
   both collapse to the same entry here and the difference lives in the provider.

   For a folder book the start is the running total of the chapters before it,
   which is the honest answer to "how far into the book does this begin" — but
   only while every earlier duration is known. One missing duration makes every
   later total a guess, so from there on the start is null and reads as a dash
   rather than as a confident wrong number. */
import type { AudiobookRecord, MediaRecord } from "../api/types";

export interface ChapterEntry {
  /** Stable across re-renders: the track id, or the mark's position in the list. */
  key: string;
  title: string;
  /** Seconds into the book, or null when it cannot be known. */
  startSeconds: number | null;
}

/** A chapter file with no tag to its name still needs to be called something. */
const trackTitle = (track: AudiobookRecord, index: number) =>
  track.title || `Chapter ${index + 1}`;

/** A folder book: its ordered tracks, each starting where the last one ended. */
export function chaptersOfBook(tracks: AudiobookRecord[]): ChapterEntry[] {
  let elapsed: number | null = 0;
  return tracks.map((track, i) => {
    const startSeconds = elapsed;
    elapsed = elapsed === null || track.duration_seconds == null
      ? null
      : elapsed + track.duration_seconds;
    return { key: track.id, title: trackTitle(track, i), startSeconds };
  });
}

/** A single file: the marks embedded in the container, if it has any. */
export function chaptersOfFile(item: MediaRecord | null): ChapterEntry[] {
  if (!item || item.media_type !== "audiobook" || !item.chapters?.length) return [];
  return item.chapters.map((chapter, i) => ({
    key: `${i}`,
    title: chapter.title || `Chapter ${i + 1}`,
    startSeconds: chapter.start_seconds,
  }));
}

/** The chapter a position falls in, or -1 before the first one starts. Marks are
    in order, so the last one at or behind the playhead is the one you are in. */
export function chapterIndexAt(entries: ChapterEntry[], seconds: number): number {
  let found = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const start = entries[i].startSeconds;
    // A hair of tolerance: seeking to 120 can land at 119.997.
    if (start !== null && start <= seconds + 0.001) found = i;
    else break;
  }
  return found;
}
