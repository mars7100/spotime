/* The app at its network boundary.
   These tests render the whole app and assert on two things only: what a person
   sees, and what the app asks the server for. Nothing here knows a component
   name, a prop, or a piece of state — splitting or renaming a component must not
   break a test unless the behaviour changed. */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { book, song, state } from "./test/fixtures";
import { givenLibrary, requests } from "./test/server";

const rowFor = async (title: string | RegExp) => {
  const row = (await screen.findByText(title)).closest("li");
  if (!row) throw new Error(`no row for ${title}`);
  return row;
};

describe("the library", () => {
  it("loads on open, without a further click", async () => {
    givenLibrary([song({ title: "Nightcall" }), song({ title: "Weightless" })]);

    render(<App />);

    expect(await screen.findByText("Nightcall")).toBeInTheDocument();
    expect(screen.getByText("Weightless")).toBeInTheDocument();
    expect(requests).toEqual([{ method: "GET", path: "/api/media", body: undefined }]);
  });

  it("shows a track's artist, album, tags and duration", async () => {
    givenLibrary([
      song({
        title: "Tadow",
        artist: "Masego & FKJ",
        album: "Single",
        duration_seconds: 303,
        tags: ["jazz", "focus"],
      }),
    ]);

    render(<App />);
    const row = await rowFor("Tadow");

    expect(within(row).getByText("Masego & FKJ — Single")).toBeInTheDocument();
    expect(within(row).getByText("jazz")).toBeInTheDocument();
    expect(within(row).getByText("focus")).toBeInTheDocument();
    expect(within(row).getByText("5:03")).toBeInTheDocument();
  });

  it("shows an em dash for a record with no recorded duration", async () => {
    givenLibrary([song({ title: "Old Import", duration_seconds: null })]);

    render(<App />);
    const row = await rowFor("Old Import");

    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText("0:00")).not.toBeInTheDocument();
  });

  it("groups the newest arrivals into their own section", async () => {
    givenLibrary(Array.from({ length: 7 }, (_, i) => song({ title: `Track ${i + 1}` })));

    render(<App />);

    expect(await screen.findByText(/Recently added/)).toBeInTheDocument();
    expect(screen.getByText(/^Library/)).toBeInTheDocument();
  });

  it("tells a first-time listener what to do next", async () => {
    givenLibrary([]);

    render(<App />);

    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
    expect(screen.getByText(/paste a video or playlist link/i)).toBeInTheDocument();
  });
});

describe("playback position in the library", () => {
  it("shows an audiobook's progress through the book", async () => {
    givenLibrary([
      book({
        title: "Project Hail Mary",
        duration_seconds: 1000,
        state: state({ position_seconds: 250 }),
      }),
    ]);

    render(<App />);
    const row = await rowFor("Project Hail Mary");

    expect(within(row).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(within(row).getByText(/Resume 4:10 · 25%/)).toBeInTheDocument();
  });

  it("marks a finished book as finished", async () => {
    givenLibrary([
      book({ title: "Finished Book", state: state({ position_seconds: 900, completed: true }) }),
    ]);

    render(<App />);
    const row = await rowFor("Finished Book");

    expect(within(row).getByText("Finished")).toBeInTheDocument();
    expect(within(row).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows no progress indicator on a song, whatever the server sends", async () => {
    // The server never sends a state for music; if one ever leaked through, the
    // library still must not imply a position a song does not have.
    const smuggled = { ...song({ title: "Sedona" }), state: state({ position_seconds: 90 }) };
    givenLibrary([smuggled as never]);

    render(<App />);
    const row = await rowFor("Sedona");

    expect(within(row).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(row).queryByText(/Resume/)).not.toBeInTheDocument();
  });

  it("shows a folder-uploaded book as one row with its chapters' combined progress", async () => {
    givenLibrary([
      book({
        title: "Chapter 2",
        book_id: "b1",
        book_title: "Dune",
        track_number: 2,
        duration_seconds: 100,
        state: null,
      }),
      book({
        title: "Chapter 1",
        book_id: "b1",
        book_title: "Dune",
        track_number: 1,
        duration_seconds: 100,
        state: state({ position_seconds: 100, completed: true }),
      }),
    ]);

    render(<App />);
    const row = await rowFor("Dune");

    expect(screen.queryByText("Chapter 1")).not.toBeInTheDocument();
    expect(within(row).getByText("Andy Weir — 2 chapters")).toBeInTheDocument();
    expect(within(row).getByText(/1 of 2 chapters · 50%/)).toBeInTheDocument();
  });
});
