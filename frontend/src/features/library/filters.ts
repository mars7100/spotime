/* The three narrowing tools, as one pure pass over the library.
   Search, kind and tags are applied together here rather than each in its own
   place, so they compose by construction instead of by discipline: a track is
   in view when it survives all three, and there is one order of operations to
   reason about.

   Search runs client-side. The API has a `?search=` parameter and the vanilla
   client used it, but a server-narrowed payload is the wrong basis for tag
   counts — the tag list would shrink as you type, and a selected tag could
   vanish out from under its own chip. One fetch, filtered here, keeps the
   counts honest and the three tools independent. */
import type { MediaRecord } from "../../api/types";

/** The kind tabs. `all` is not a media type — it is the absence of the filter. */
export type Kind = "all" | "music" | "audiobook";

/** Exact order and labels the sort dropdown shows. */
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
  { value: "artist-asc", label: "Artist A–Z" },
  { value: "artist-desc", label: "Artist Z–A" },
  { value: "duration-asc", label: "Shortest first" },
  { value: "duration-desc", label: "Longest first" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export const DEFAULT_SORT: SortKey = "newest";

export interface Filters {
  search: string;
  kind: Kind;
  /** ANDed: a track must carry every one of them. */
  tags: string[];
  sort: SortKey;
}

export const NO_FILTERS: Filters = { search: "", kind: "all", tags: [], sort: DEFAULT_SORT };

/** Whether anything is narrowing the library — the library sections and the
    empty state both read differently when something is. */
export const isNarrowed = (f: Filters) =>
  f.kind !== "all" || f.tags.length > 0 || f.search.trim() !== "";

const matchesSearch = (item: MediaRecord, needle: string) =>
  [item.title, item.artist, item.album, item.book_title].some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );

const matchesTags = (item: MediaRecord, tags: string[]) =>
  tags.every((tag) => item.tags.includes(tag));

/** `a`/`b` nullable; a null value sorts last regardless of direction. */
const compareNullableLast = <T>(a: T | null, b: T | null, cmp: (a: T, b: T) => number): number => {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return cmp(a, b);
};

const collate = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

const COMPARATORS: Record<SortKey, (a: MediaRecord, b: MediaRecord) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  "title-asc": (a, b) => collate(a.title, b.title),
  "title-desc": (a, b) => collate(b.title, a.title),
  "artist-asc": (a, b) => compareNullableLast(a.artist, b.artist, collate),
  "artist-desc": (a, b) => compareNullableLast(a.artist, b.artist, (x, y) => collate(y, x)),
  "duration-asc": (a, b) => compareNullableLast(a.duration_seconds, b.duration_seconds, (x, y) => x - y),
  "duration-desc": (a, b) => compareNullableLast(a.duration_seconds, b.duration_seconds, (x, y) => y - x),
};

export function applyFilters(items: MediaRecord[], filters: Filters): MediaRecord[] {
  const needle = filters.search.trim().toLowerCase();
  return items
    .filter(
      (item) =>
        (filters.kind === "all" || item.media_type === filters.kind) &&
        (needle === "" || matchesSearch(item, needle)) &&
        matchesTags(item, filters.tags),
    )
    .sort(COMPARATORS[filters.sort]); // stable: Array.prototype.sort, ties keep server order
}

/** How many of these records carry each tag, sorted by name. Counting the
    records *in view* rather than the whole library means every suggestion is
    worth applying: picking one can never empty the list. */
export function tagCounts(items: MediaRecord[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Whether the library has any tags at all. Read over the *whole* library, so
    the filter does not appear and disappear as you type in the search box. */
export const hasAnyTag = (items: MediaRecord[]) => items.some((item) => item.tags.length > 0);
