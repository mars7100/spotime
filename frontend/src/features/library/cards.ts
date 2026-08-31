/* A folder of files uploaded as one book is many media records sharing a
   `book_id`. The library shows them as one card, or a 30-chapter book would
   flood the list — the same collapsing the vanilla client does, in one pure
   function instead of spread through render code. */
import type { AudiobookRecord, MediaRecord } from "../../api/types";

export interface BookProgress {
  done: number;
  total: number;
  /** 0–100, weighted by chapter duration where durations are known. */
  percent: number;
  started: boolean;
  finished: boolean;
  /** The chapter to resume at: the first unfinished one. */
  resumeIndex: number;
}

export type Card =
  | { kind: "track"; id: string; item: MediaRecord }
  | {
      kind: "book";
      id: string;
      title: string;
      artist: string | null;
      tracks: AudiobookRecord[];
      progress: BookProgress;
      artworkId: string | null;
    };

const byTrackOrder = (a: AudiobookRecord, b: AudiobookRecord) => {
  const an = a.track_number ?? Number.MAX_SAFE_INTEGER;
  const bn = b.track_number ?? Number.MAX_SAFE_INTEGER;
  return an !== bn ? an - bn : a.title.localeCompare(b.title);
};

export function bookProgress(tracks: AudiobookRecord[]): BookProgress {
  let done = 0;
  let totalDuration = 0;
  let playedDuration = 0;
  let started = false;

  for (const t of tracks) {
    const duration = t.duration_seconds ?? 0;
    totalDuration += duration;
    if (t.state?.completed) {
      done += 1;
      playedDuration += duration;
    } else if (t.state) {
      playedDuration += duration
        ? Math.min(t.state.position_seconds, duration)
        : t.state.position_seconds;
    }
    if (t.state && (t.state.position_seconds > 5 || t.state.completed)) started = true;
  }

  const percent = totalDuration
    ? (playedDuration / totalDuration) * 100
    : (done / Math.max(1, tracks.length)) * 100;
  const firstUnfinished = tracks.findIndex((t) => !t.state?.completed);

  return {
    done,
    total: tracks.length,
    percent: Math.min(100, percent),
    started,
    finished: tracks.length > 0 && done === tracks.length,
    resumeIndex: firstUnfinished === -1 ? 0 : firstUnfinished,
  };
}

/** Collapses books; standalone records pass through. Input order is preserved,
    a book taking the slot of its newest chapter. */
export function toCards(items: MediaRecord[]): Card[] {
  const books = new Map<string, Extract<Card, { kind: "book" }>>();
  const cards: Card[] = [];

  for (const item of items) {
    if (item.media_type === "audiobook" && item.book_id) {
      let card = books.get(item.book_id);
      if (!card) {
        card = {
          kind: "book",
          id: item.book_id,
          title: item.book_title || "Audiobook",
          artist: item.artist,
          tracks: [],
          progress: bookProgress([]),
          artworkId: null,
        };
        books.set(item.book_id, card);
        cards.push(card);
      }
      card.tracks.push(item);
    } else {
      cards.push({ kind: "track", id: item.id, item });
    }
  }

  for (const card of books.values()) {
    card.tracks.sort(byTrackOrder);
    card.progress = bookProgress(card.tracks);
    card.artist = card.artist ?? card.tracks.find((t) => t.artist)?.artist ?? null;
    card.artworkId = card.tracks.find((t) => t.artwork_path)?.id ?? null;
  }

  return cards;
}
