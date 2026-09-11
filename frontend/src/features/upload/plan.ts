/* Turning a pile of dropped files into an ordered upload plan.
   Two decisions live here, and both are the reason a book behaves like one
   thing: a folder of audio files becomes a book with its chapters in order, and
   a file already in the library is left alone rather than uploaded twice. */
import type { Tags } from "jsmediatags/types";
import type { MediaRecord } from "../../api/types";
import { guessMediaType, parseTrackNumber } from "./metadata";

/** A file, where it came from, and what it says about itself. Tags are read
    before planning because the track number decides chapter order — and they
    are carried through so the upload does not read the file a second time. */
export interface PickedFile {
  file: File;
  /** "Book/ch1.mp3" for anything inside a folder; "" for a loose file. */
  path: string;
  tags: Tags;
}

export interface UploadBook {
  id: string;
  title: string;
}

/** One file to upload, and the book it is a chapter of (null for a loose file). */
export interface UploadUnit {
  file: File;
  tags: Tags;
  book: UploadBook | null;
  /** The chapter's position in the book — null for a loose file. */
  trackNumber: number | null;
  mediaType: "music" | "audiobook";
}

/** The folder a file sits in, or "" when it was picked on its own. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

/** "chapter2" before "chapter10", which a plain string sort gets backwards. */
const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const newId = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `book-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Book ids by title, so re-adding a folder lands in the book you already have
    — and resumes where you left it — instead of creating a second copy. */
export function booksByTitle(library: MediaRecord[]): Map<string, string> {
  const books = new Map<string, string>();
  for (const item of library) {
    if (item.book_id && item.book_title) books.set(item.book_title, item.book_id);
  }
  return books;
}

/** Group by source folder: any folder holding two or more audio files is a
    book, its chapters ordered by track tag and then by natural filename. */
export function planBooks(files: PickedFile[], existingBooks: Map<string, string>): UploadUnit[] {
  const byFolder = new Map<string, PickedFile[]>();
  for (const picked of files) {
    const folder = folderOf(picked.path);
    const group = byFolder.get(folder);
    if (group) group.push(picked);
    else byFolder.set(folder, [picked]);
  }

  const units: UploadUnit[] = [];
  for (const [folder, group] of byFolder) {
    if (!folder || group.length < 2) {
      for (const picked of group) {
        units.push({
          file: picked.file,
          tags: picked.tags,
          book: null,
          trackNumber: null,
          mediaType: guessMediaType(picked.file.name),
        });
      }
      continue;
    }
    const title = folder.split("/").pop() as string;
    const book: UploadBook = { id: existingBooks.get(title) ?? newId(), title };
    const ordered = [...group].sort((a, b) => {
      const [ta, tb] = [parseTrackNumber(a.tags.track), parseTrackNumber(b.tags.track)];
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return naturalCompare(a.file.name, b.file.name);
    });
    ordered.forEach((picked, i) => {
      units.push({
        file: picked.file,
        tags: picked.tags,
        book,
        trackNumber: i + 1,
        mediaType: "audiobook",
      });
    });
  }
  return units;
}

/* Matched on (book, original filename) — the same scoping the server dedups on,
   so two different books can each hold a "Chapter 1.mp3". Skipping here means
   the bytes are never sent; the server's own check is the backstop. */
const dedupKey = (bookId: string | null, filename: string) => `${bookId ?? ""}\n${filename}`;

/** The units worth uploading, and how many the library already had. */
export function withoutAlreadyInLibrary(
  units: UploadUnit[],
  library: MediaRecord[],
): { queue: UploadUnit[]; skipped: number } {
  const known = new Set(
    library
      .filter((item) => item.original_filename)
      .map((item) => dedupKey(item.book_id, item.original_filename as string)),
  );
  const queue = units.filter(
    (unit) => !known.has(dedupKey(unit.book?.id ?? null, unit.file.name)),
  );
  return { queue, skipped: units.length - queue.length };
}
