/* Narrowing the library, at the app's network boundary.
   The library is loaded once and narrowed in the client, so these tests drive
   the real controls and assert on the rows a person can see — never on filter
   state, and never on a component's name. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { book, song } from "./test/fixtures";
import { endCurrentTrack, mediaElement } from "./test/media";
import { givenLibrary, streamUrl } from "./test/server";

/** The titles currently rendered as rows, in order. */
const shownTitles = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector(".row-title")?.textContent ?? "");

/** Waits for the library to have loaded before touching a control. */
const libraryLoaded = (title: string) => screen.findByText(title);

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

    const options = screen.getAllByRole("option").map((o) => o.textContent);
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

describe("the queue under a filter", () => {
  it("plays on through what is in view, not through what the filter hid", async () => {
    // The queue is the music currently *in view*: narrowing the library is how
    // you choose what plays next, so a hidden track must not be handed over
    // when the current one ends.
    const [a, hidden, b] = [
      song({ title: "First", tags: ["set"] }),
      song({ title: "Hidden", tags: [] }),
      song({ title: "Second", tags: ["set"] }),
    ];
    givenLibrary([a, hidden, b]);

    render(<App />);
    await screen.findByText("First");
    await userEvent.click(screen.getByLabelText("Filter by tag"));
    await userEvent.click(await screen.findByRole("option", { name: /^set/ }));

    await userEvent.click(await screen.findByRole("button", { name: "Play First" }));
    await waitFor(() => expect(mediaElement().getAttribute("src")).toBe(streamUrl(a.id)));

    endCurrentTrack();

    await waitFor(() => expect(mediaElement().getAttribute("src")).toBe(streamUrl(b.id)));
  });
});
