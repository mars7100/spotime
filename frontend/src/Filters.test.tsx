/* Narrowing the library, at the app's network boundary.
   The library is loaded once and narrowed in the client, so these tests drive
   the real controls and assert on the rows a person can see — never on filter
   state, and never on a component's name. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { MediaRecord } from "./api/types";
import { book, song } from "./test/fixtures";
import { endCurrentTrack, mediaElement } from "./test/media";
import { givenLibrary, http, HttpResponse, server, streamUrl } from "./test/server";

afterEach(() => vi.restoreAllMocks());

/** The titles currently rendered as rows, in order. */
const shownTitles = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector(".row-title")?.textContent ?? "");

/** Waits for the library to have loaded before touching a control. */
const libraryLoaded = (title: string) => screen.findByText(title);

/** Waits for this track's URL to reach the element — the sign a play (or a
    step to the next queued track) actually landed. */
const nowPlaying = (id: string) =>
  waitFor(() => expect(mediaElement().getAttribute("src")).toBe(streamUrl(id)));

const LIBRARY = [
  song({ title: "Nightcall", artist: "Kavinsky", album: "OutRun", tags: ["night", "synth"] }),
  song({ title: "Tadow", artist: "Masego", album: "Single", tags: ["jazz"] }),
  song({ title: "Weightless", artist: "Marconi Union", album: "Ambient", tags: ["focus", "night"] }),
  book({ title: "Project Hail Mary", artist: "Andy Weir" }),
];

describe("search", () => {
  it("narrows the library by title", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.type(screen.getByLabelText("Search library"), "weightless");

    expect(shownTitles()).toEqual(["Weightless"]);
  });

  it("narrows the library by artist", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.type(screen.getByLabelText("Search library"), "Kavinsky");

    expect(shownTitles()).toEqual(["Nightcall"]);
  });

  it("narrows the library by album", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.type(screen.getByLabelText("Search library"), "OutRun");

    expect(shownTitles()).toEqual(["Nightcall"]);
  });

  it("says the filters emptied the list rather than offering an upload prompt", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.type(screen.getByLabelText("Search library"), "nothing matches this");

    expect(screen.getByText(/No tracks match/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/)).not.toBeInTheDocument();
  });
});

describe("the kind tabs", () => {
  it("shows everything under All", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(shownTitles()).toHaveLength(4);
  });

  it("drops audiobooks under Music", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.click(screen.getByRole("tab", { name: "Music" }));

    expect(shownTitles()).toEqual(["Nightcall", "Tadow", "Weightless"]);
  });

  it("keeps only audiobooks under Audiobooks", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.click(screen.getByRole("tab", { name: "Audiobooks" }));

    expect(shownTitles()).toEqual(["Project Hail Maryaudiobook"]);
  });
});

describe("tag filtering", () => {
  const openTagList = async () => {
    await userEvent.click(screen.getByLabelText("Filter by tag"));
    return screen.findByRole("listbox", { name: "Matching tags" });
  };

  it("narrows to the tracks carrying a tag", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await openTagList();
    await userEvent.click(screen.getByRole("option", { name: /night/ }));

    expect(shownTitles()).toEqual(["Nightcall", "Weightless"]);
  });

  it("narrows to the intersection when several tags are applied", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await openTagList();
    await userEvent.click(screen.getByRole("option", { name: /night/ }));
    await openTagList();
    await userEvent.click(screen.getByRole("option", { name: /synth/ }));

    expect(shownTitles()).toEqual(["Nightcall"]);
  });

  it("shows each applied filter as a chip that can be dismissed on its own", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await openTagList();
    await userEvent.click(screen.getByRole("option", { name: /night/ }));
    await openTagList();
    await userEvent.click(screen.getByRole("option", { name: /synth/ }));
    expect(shownTitles()).toEqual(["Nightcall"]);

    await userEvent.click(screen.getByRole("button", { name: "Remove filter synth" }));

    expect(screen.queryByRole("button", { name: "Remove filter synth" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter night" })).toBeInTheDocument();
    expect(shownTitles()).toEqual(["Nightcall", "Weightless"]);
  });

  it("shows how many tracks carry each tag, without asking the server", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    const list = await openTagList();

    expect(within(list).getByRole("option", { name: "night, 2 tracks" })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "jazz, 1 track" })).toBeInTheDocument();
  });

  it("finds a tag by typing, so the filter survives hundreds of them", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.type(screen.getByLabelText("Filter by tag"), "ja");

    const list = screen.getByRole("listbox", { name: "Matching tags" });
    const options = within(list).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["jazz1"]);
  });

  it("is not shown at all when nothing in the library is tagged", async () => {
    givenLibrary([song({ title: "Untagged", tags: [] })]);
    render(<App />);
    await libraryLoaded("Untagged");

    expect(screen.queryByLabelText("Filter by tag")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search library")).toBeInTheDocument();
  });
});

describe("the three narrowing tools together", () => {
  it("applies search, tab and tags at once", async () => {
    givenLibrary([
      ...LIBRARY,
      song({ title: "Night Drive", artist: "Kavinsky", album: "OutRun", tags: ["night"] }),
      book({ title: "Night Watch", artist: "Terry Pratchett", tags: ["night", "synth"] }),
    ]);
    render(<App />);
    await libraryLoaded("Nightcall");

    // Tab first: the book called "Night Watch" carries both tags and would
    // otherwise survive everything else.
    await userEvent.click(screen.getByRole("tab", { name: "Music" }));
    await userEvent.click(screen.getByLabelText("Filter by tag"));
    await userEvent.click(await screen.findByRole("option", { name: /^night/ }));
    await userEvent.type(screen.getByLabelText("Search library"), "kavinsky");

    // Music (drops the books) ∧ tagged "night" (drops Tadow) ∧ "kavinsky"
    // (drops Weightless).
    expect(shownTitles()).toEqual(["Nightcall", "Night Drive"]);
  });

  it("restores the full library as each tool is released", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await libraryLoaded("Nightcall");

    await userEvent.click(screen.getByRole("tab", { name: "Music" }));
    await userEvent.click(screen.getByLabelText("Filter by tag"));
    await userEvent.click(await screen.findByRole("option", { name: /^night/ }));
    await userEvent.type(screen.getByLabelText("Search library"), "night");
    expect(shownTitles()).toEqual(["Nightcall"]);

    await userEvent.clear(screen.getByLabelText("Search library"));
    await userEvent.click(screen.getByRole("button", { name: "Remove filter night" }));
    await userEvent.click(screen.getByRole("tab", { name: "All" }));

    expect(shownTitles()).toHaveLength(4);
  });
});

describe("the queue is captured when a song is clicked", () => {
  const applyTag = async (tag: string) => {
    await userEvent.click(screen.getByLabelText("Filter by tag"));
    await userEvent.click(await screen.findByRole("option", { name: new RegExp(`^${tag}`) }));
  };

  it("plays on through the filtered list that was in view when the song was clicked", async () => {
    const [a, hidden, b] = [
      song({ title: "First", tags: ["set"] }),
      song({ title: "Hidden", tags: [] }),
      song({ title: "Second", tags: ["set"] }),
    ];
    givenLibrary([a, hidden, b]);
    render(<App />);
    await libraryLoaded("First");
    await applyTag("set");

    await userEvent.click(await screen.findByRole("button", { name: "Play First" }));
    await nowPlaying(a.id);
    endCurrentTrack();

    await nowPlaying(b.id);
  });

  it("keeps playing when a filter applied afterwards hides the playing song", async () => {
    // The reported bug: the playing song fell out of the queue, so Next did nothing.
    const [untagged, next, last] = [
      song({ title: "Untagged", tags: [] }),
      song({ title: "Tagged One", tags: ["x"] }),
      song({ title: "Tagged Two", tags: ["x"] }),
    ];
    givenLibrary([untagged, next, last]);
    render(<App />);
    await libraryLoaded("Untagged");

    await userEvent.click(screen.getByRole("button", { name: "Play Untagged" }));
    await nowPlaying(untagged.id);
    await applyTag("x");
    await userEvent.click(screen.getByRole("button", { name: "Next track" }));

    await nowPlaying(next.id);
  });

  it("does not change what plays next when the filters change after the click", async () => {
    const [a, b, c] = [
      song({ title: "A", tags: ["x"] }),
      song({ title: "B", tags: [] }),
      song({ title: "C", tags: ["x"] }),
    ];
    givenLibrary([a, b, c]);
    render(<App />);
    await libraryLoaded("A");

    await userEvent.click(screen.getByRole("button", { name: "Play A" }));
    await nowPlaying(a.id);
    await applyTag("x");
    endCurrentTrack();

    // B was next in the list that was in view at the click.
    await nowPlaying(b.id);
  });

  it("skips a track deleted from the captured queue", async () => {
    const [a, b, c] = [song({ title: "A" }), song({ title: "B" }), song({ title: "C" })];
    let library: MediaRecord[] = [a, b, c];
    server.use(
      http.get("/api/media", () => HttpResponse.json(library)),
      http.delete("/api/media/:id", ({ params }) => {
        library = library.filter((it) => it.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await libraryLoaded("A");

    await userEvent.click(screen.getByRole("button", { name: "Play A" }));
    await nowPlaying(a.id);
    await userEvent.click(screen.getByRole("button", { name: "More for B" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(shownTitles()).toEqual(["A", "C"]));
    endCurrentTrack();

    await nowPlaying(c.id);
  });
});

describe("sorting", () => {
  // Given out of every order under test. Cherry has no artist and Date no
  // duration: both go last whichever way the sort runs.
  const banana = song({ title: "banana", artist: "Zed", duration_seconds: 200, created_at: "2026-01-03T00:00:00Z" });
  const date = song({ title: "Date", artist: "Moby", duration_seconds: null, created_at: "2026-01-04T00:00:00Z" });
  const apple = song({ title: "Apple", artist: "adele", duration_seconds: 100, created_at: "2026-01-01T00:00:00Z" });
  const cherry = song({ title: "cherry", artist: null, duration_seconds: 300, created_at: "2026-01-02T00:00:00Z" });
  const SORTABLE = [banana, date, apple, cherry];

  const sortBy = (option: string) =>
    userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort" }), option);

  it("defaults to Newest first", async () => {
    givenLibrary(SORTABLE);
    render(<App />);
    await libraryLoaded("Apple");

    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveDisplayValue("Newest first");
    expect(
      within(screen.getByRole("combobox", { name: "Sort" }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Newest first",
      "Oldest first",
      "Title A–Z",
      "Title Z–A",
      "Artist A–Z",
      "Artist Z–A",
      "Shortest first",
      "Longest first",
    ]);
  });

  it.each([
    ["Oldest first", ["Apple", "cherry", "banana", "Date"]],
    ["Title A–Z", ["Apple", "banana", "cherry", "Date"]],
    ["Title Z–A", ["Date", "cherry", "banana", "Apple"]],
    ["Artist A–Z", ["Apple", "Date", "banana", "cherry"]],
    ["Artist Z–A", ["banana", "Date", "Apple", "cherry"]],
    ["Shortest first", ["Apple", "banana", "cherry", "Date"]],
    ["Longest first", ["cherry", "banana", "Apple", "Date"]],
    ["Newest first", ["Date", "banana", "cherry", "Apple"]],
  ])("orders the rows under %s", async (option, expected) => {
    givenLibrary(SORTABLE);
    render(<App />);
    await libraryLoaded("Apple");

    await sortBy(option);

    expect(shownTitles()).toEqual(expected);
  });

  it("shows a single Results section under any sort but Newest first", async () => {
    givenLibrary(SORTABLE);
    render(<App />);
    await libraryLoaded("Apple");

    await sortBy("Title A–Z");

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Results 4"]);
  });

  it("queues in the sorted order the song was clicked under", async () => {
    givenLibrary(SORTABLE);
    render(<App />);
    await libraryLoaded("Apple");

    await sortBy("Title A–Z");
    await userEvent.click(screen.getByRole("button", { name: "Play banana" }));
    await nowPlaying(banana.id);
    endCurrentTrack();

    await nowPlaying(cherry.id);
  });
});
