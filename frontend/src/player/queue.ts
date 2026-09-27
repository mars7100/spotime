/* The playback queue, as pure functions.
   The queue is the standalone music that was in view when a song was clicked,
   captured then rather than tracking the library's filters afterwards. Books
   are excluded: a folder book advances chapter-to-chapter on its own, and a
   single-file book has nowhere to advance to. */
import type { MediaRecord } from "../api/types";

export const queueable = (items: MediaRecord[]): MediaRecord[] =>
  items.filter((it) => it.media_type === "music" && !it.book_id);

/** Fisher–Yates over a copy: every track comes out exactly once. `pin` is moved
    to the head so toggling shuffle mid-track does not yank what is playing. */
export function shuffleOrder(tracks: MediaRecord[], pin?: string | null): MediaRecord[] {
  const out = tracks.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (pin) {
    const at = out.findIndex((t) => t.id === pin);
    if (at > 0) [out[0], out[at]] = [out[at], out[0]];
  }
  return out;
}

export const buildQueue = (
  items: MediaRecord[],
  { shuffle, pin }: { shuffle: boolean; pin?: string | null },
): MediaRecord[] => (shuffle ? shuffleOrder(queueable(items), pin) : queueable(items));

/** The track `delta` places from `id`, or null at either end — the queue does
    not wrap; reaching the bottom of the list stops. */
export function stepFrom(queue: MediaRecord[], id: string, delta: number): MediaRecord | null {
  const i = queue.findIndex((t) => t.id === id);
  if (i === -1) return null;
  return queue[i + delta] ?? null;
}
