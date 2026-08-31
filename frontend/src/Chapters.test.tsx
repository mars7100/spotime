/* Navigating a book by its chapters — the marks inside one long file, and the
   files of a book uploaded as a folder. Driven through the app: the tests click
   rows and chapter entries and assert on what the element was asked to do. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { book, song, state } from "./test/fixtures";
import { givenLibrary, givenSavedState, streamUrl } from "./test/server";
import { advanceTo, endCurrentTrack, givenMetadata, mediaElement } from "./test/media";

const user = userEvent.setup();

const player = () => screen.getByRole("contentinfo", { name: "Player" });
const playRow = async (title: string) =>
  user.click(await screen.findByRole("button", { name: `Play ${title}` }));
const openChapters = async () =>
  user.click(await within(player()).findByRole("button", { name: "Chapters" }));
const chapterRows = () => within(screen.getByRole("list", { name: "Chapters" })).queryAllByRole("button");
const chapter = (name: RegExp) => screen.getByRole("button", { name });
const source = () => mediaElement().getAttribute("src");

const marked = book({
  title: "Project Hail Mary",
  duration_seconds: 3600,
  chapters: [
    { title: "Prologue", start_seconds: 0 },
    { title: "One", start_seconds: 120 },
    { title: "Two", start_seconds: 300 },
  ],
});

/** A book uploaded as a folder: three records sharing a book id. */
const folder = () => {
  const chapters = ["Chapter One", "Chapter Two", "Chapter Three"].map((title, i) =>
    book({
      title,
      book_id: "dune",
      book_title: "Dune",
      track_number: i + 1,
      duration_seconds: 600,
    }),
  );
  return chapters;
};

describe("a book with chapter marks", () => {
  it("lists them with their start times", async () => {
    givenLibrary([marked]);
    givenSavedState(marked, state({ media_id: marked.id }));

    render(<App />);
    await playRow("Project Hail Mary");
    await openChapters();

    const rows = chapterRows();
    expect(rows.map((r) => r.textContent)).toEqual(["Prologue0:00", "One2:00", "Two5:00"]);
  });

  it("seeks to a chapter when it is picked", async () => {
    givenLibrary([marked]);
    givenSavedState(marked, state({ media_id: marked.id }));

    render(<App />);
    await playRow("Project Hail Mary");
    givenMetadata(3600);
    await openChapters();

    await user.click(chapter(/^Two/));

    expect(mediaElement().currentTime).toBe(300);
    // Still the same file: picking a mark is a seek, not a load.
    expect(source()).toBe(streamUrl(marked.id));
  });

  it("marks the chapter being listened to, and follows playback into the next", async () => {
    givenLibrary([marked]);
    givenSavedState(marked, state({ media_id: marked.id }));

    render(<App />);
    await playRow("Project Hail Mary");
    givenMetadata(3600);
    await openChapters();

    expect(chapter(/^Prologue/)).toHaveAttribute("aria-current", "true");
    expect(chapter(/^One/)).not.toHaveAttribute("aria-current");

    advanceTo(200);

    await waitFor(() => expect(chapter(/^One/)).toHaveAttribute("aria-current", "true"));
    expect(chapter(/^Prologue/)).not.toHaveAttribute("aria-current");
  });

  it("says so when the book runs out, rather than going quiet", async () => {
    givenLibrary([marked]);
    givenSavedState(marked, state({ media_id: marked.id }));

    render(<App />);
    await playRow("Project Hail Mary");
    givenMetadata(3600);

    advanceTo(3600);
    endCurrentTrack();

    expect(await within(player()).findByRole("status")).toHaveTextContent(/end of the book/i);
  });
});

describe("no chapters, no chapter list", () => {
  it("offers none for a song", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");
    await waitFor(() => expect(mediaElement().paused).toBe(false));

    expect(within(player()).queryByRole("button", { name: "Chapters" })).toBeNull();
  });

  it("offers none for a book whose file carries no marks", async () => {
    const plain = book({ title: "Plain Book", chapters: null });
    givenLibrary([plain]);
    givenSavedState(plain, state({ media_id: plain.id }));

    render(<App />);
    await playRow("Plain Book");
    await waitFor(() => expect(mediaElement().paused).toBe(false));

    expect(within(player()).queryByRole("button", { name: "Chapters" })).toBeNull();
  });
});

describe("a book uploaded as a folder", () => {
  it("plays its files in order, one running on into the next", async () => {
    const [one, two] = folder();
    givenLibrary([one, two]);

    render(<App />);
    await playRow("Dune");
    await waitFor(() => expect(source()).toBe(streamUrl(one.id)));
    givenMetadata(600);

    advanceTo(600);
    endCurrentTrack();

    await waitFor(() => expect(source()).toBe(streamUrl(two.id)));
    expect(mediaElement().paused).toBe(false);
  });

  it("opens at the first chapter you have not finished", async () => {
    const [one, two, three] = folder();
    // The library payload carries each chapter's state, which is how the row
    // knows a book is partway through before anything is played.
    const done = { ...one, state: state({ media_id: one.id, position_seconds: 600, completed: true }) };
    givenLibrary([done, two, three]);

    render(<App />);
    await playRow("Dune");

    await waitFor(() => expect(source()).toBe(streamUrl(two.id)));
  });

  it("lists its files as the book's chapters and loads the one picked", async () => {
    const [one, two, three] = folder();
    givenLibrary([one, two, three]);

    render(<App />);
    await playRow("Dune");
    await waitFor(() => expect(source()).toBe(streamUrl(one.id)));
    await openChapters();

    expect(chapterRows().map((r) => r.textContent)).toEqual([
      "Chapter One0:00",
      "Chapter Two10:00",
      "Chapter Three20:00",
    ]);
    expect(chapter(/^Chapter One/)).toHaveAttribute("aria-current", "true");

    await user.click(chapter(/^Chapter Three/));

    await waitFor(() => expect(source()).toBe(streamUrl(three.id)));
    expect(chapter(/^Chapter Three/)).toHaveAttribute("aria-current", "true");
  });

  it("says so at the end of the last chapter", async () => {
    const [one, two] = folder();
    givenLibrary([one, two]);

    render(<App />);
    await playRow("Dune");
    await waitFor(() => expect(source()).toBe(streamUrl(one.id)));
    givenMetadata(600);
    advanceTo(600);
    endCurrentTrack();

    await waitFor(() => expect(source()).toBe(streamUrl(two.id)));
    givenMetadata(600);
    advanceTo(600);
    endCurrentTrack();

    expect(await within(player()).findByRole("status")).toHaveTextContent(/last chapter/i);
  });

  it("names the book, with the chapter you are in", async () => {
    const [one, two] = folder();
    givenLibrary([one, two]);

    render(<App />);
    await playRow("Dune");
    await waitFor(() => expect(source()).toBe(streamUrl(one.id)));

    expect(within(player()).getByText("Dune")).toBeInTheDocument();
    expect(within(player()).getByText("Chapter One · 1/2")).toBeInTheDocument();
  });
});
