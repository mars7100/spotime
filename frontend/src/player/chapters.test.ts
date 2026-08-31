import { describe, expect, it } from "vitest";
import { chapterIndexAt, chaptersOfBook, chaptersOfFile } from "./chapters";
import { book, song } from "../test/fixtures";

describe("chapters of a single file", () => {
  it("reads the marks embedded in the container", () => {
    const phm = book({
      chapters: [
        { title: "Prologue", start_seconds: 0 },
        { title: "One", start_seconds: 120 },
      ],
    });

    expect(chaptersOfFile(phm)).toEqual([
      { key: "0", title: "Prologue", startSeconds: 0 },
      { key: "1", title: "One", startSeconds: 120 },
    ]);
  });

  it("has none for music, and none for a book with no marks", () => {
    expect(chaptersOfFile(song())).toEqual([]);
    expect(chaptersOfFile(book({ chapters: null }))).toEqual([]);
    expect(chaptersOfFile(null)).toEqual([]);
  });
});

describe("chapters of a folder book", () => {
  it("starts each chapter where the last one ended", () => {
    const one = book({ title: "One", duration_seconds: 600 });
    const two = book({ title: "Two", duration_seconds: 300 });

    expect(chaptersOfBook([one, two])).toEqual([
      { key: one.id, title: "One", startSeconds: 0 },
      { key: two.id, title: "Two", startSeconds: 600 },
    ]);
  });

  it("stops claiming a start once a duration is missing", () => {
    // A guessed offset is worse than no offset: every later chapter would be
    // wrong by however long the unmeasured file runs.
    const one = book({ title: "One", duration_seconds: null });
    const two = book({ title: "Two", duration_seconds: 300 });

    expect(chaptersOfBook([one, two]).map((c) => c.startSeconds)).toEqual([0, null]);
  });

  it("names an untitled chapter by its place in the book", () => {
    expect(chaptersOfBook([book({ title: "" })])[0].title).toBe("Chapter 1");
  });
});

describe("which chapter a position is in", () => {
  const entries = chaptersOfFile(
    book({
      chapters: [
        { title: "Prologue", start_seconds: 0 },
        { title: "One", start_seconds: 120 },
        { title: "Two", start_seconds: 300 },
      ],
    }),
  );

  it("is the last chapter the playhead has gone past", () => {
    expect(chapterIndexAt(entries, 0)).toBe(0);
    expect(chapterIndexAt(entries, 119)).toBe(0);
    expect(chapterIndexAt(entries, 120)).toBe(1);
    expect(chapterIndexAt(entries, 9000)).toBe(2);
  });

  it("tolerates a seek landing a hair short of the mark", () => {
    expect(chapterIndexAt(entries, 119.9995)).toBe(1);
  });

  it("is nothing at all when there are no chapters", () => {
    expect(chapterIndexAt([], 42)).toBe(-1);
  });
});
