/* The behaviour the whole app exists for: a book reopens where you stopped.
   Driven at the app's network boundary — the tests click rows and buttons and
   assert on what the app asked the element and the server to do. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { book, song, state } from "./test/fixtures";
import { givenLibrary, givenSavedState, requests, savesFor } from "./test/server";
import {
  advanceTo,
  endCurrentTrack,
  givenMetadata,
  hidePage,
  mediaElement,
  showPage,
} from "./test/media";

const user = userEvent.setup();

const player = () => screen.getByRole("contentinfo", { name: "Player" });
const playRow = async (title: string) =>
  user.click(await screen.findByRole("button", { name: `Play ${title}` }));
const stateRequests = () => requests.filter((r) => r.path.includes("/state"));

describe("resuming an audiobook", () => {
  it("starts at the saved position, not at zero", async () => {
    const phm = book({ title: "Project Hail Mary", duration_seconds: 3600 });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 1234 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().getAttribute("src")).toBeTruthy());

    // A media element cannot be seeked before it knows its duration.
    expect(mediaElement().currentTime).toBe(0);
    givenMetadata(3600);

    expect(mediaElement().currentTime).toBe(1234);
    expect(await within(player()).findByText("20:34")).toBeInTheDocument();
  });

  it("restores the speed it was being listened at", async () => {
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 600, playback_speed: 1.5 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");

    await waitFor(() => expect(mediaElement().playbackRate).toBe(1.5));
  });

  it("does not carry a book's speed over to a song", async () => {
    // Speed is a property of the book, not of the session.
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 600, playback_speed: 1.5 }));
    const nightcall = song({ title: "Nightcall" });
    givenLibrary([phm, nightcall]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().playbackRate).toBe(1.5));

    await playRow("Nightcall");

    await waitFor(() => expect(mediaElement().playbackRate).toBe(1));
  });

  it("ignores a position barely into the file", async () => {
    // Two seconds in is a mis-tap, not a place worth resuming to.
    const phm = book({ title: "Project Hail Mary", duration_seconds: 3600 });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 2 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().getAttribute("src")).toBeTruthy());
    givenMetadata(3600);

    expect(mediaElement().currentTime).toBe(0);
  });

  it("starts a finished book again from the beginning", async () => {
    const phm = book({ title: "Project Hail Mary", duration_seconds: 3600 });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 3599, completed: true }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().getAttribute("src")).toBeTruthy());
    givenMetadata(3600);

    expect(mediaElement().currentTime).toBe(0);
  });
});

describe("saving a position", () => {
  beforeEach(() => {
    // Simulated time, so a fifteen-second save interval costs no wall clock.
    // Real time still advances, or msw's responses would never arrive.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("saves periodically while playback runs", async () => {
    const phm = book({ title: "Project Hail Mary", duration_seconds: 3600 });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);

    advanceTo(20);
    await vi.advanceTimersByTimeAsync(15_000);
    await waitFor(() => expect(savesFor(phm)).toHaveLength(1));
    expect(savesFor(phm)[0].body).toMatchObject({ position_seconds: 20 });

    advanceTo(40);
    await vi.advanceTimersByTimeAsync(15_000);
    await waitFor(() => expect(savesFor(phm)).toHaveLength(2));
    expect(savesFor(phm)[1].body).toMatchObject({ position_seconds: 40 });
  });

  it("does not write a zero over a saved position while the file is still loading", async () => {
    /* Before metadata arrives, `currentTime` is 0 because there is no audio —
       not because the listener is at the start. A save here would destroy the
       very position the next play is meant to resume from. */
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 1800 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));

    // No metadata: the load is still in flight.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(savesFor(phm)).toHaveLength(0);
  });

  it("stops saving once playback stops", async () => {
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);

    advanceTo(30);
    await user.click(within(player()).getByRole("button", { name: "Pause" }));

    // Pausing flushes once — and then the ticking stops.
    await waitFor(() => expect(savesFor(phm)).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(savesFor(phm)).toHaveLength(1);
  });
});

describe("leaving the page", () => {
  it("saves when the tab is hidden", async () => {
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);
    advanceTo(300);

    hidePage();

    await waitFor(() => expect(savesFor(phm)).toHaveLength(1));
    expect(savesFor(phm)[0].body).toMatchObject({ position_seconds: 300 });
    showPage();
  });

  it("saves when the page goes away", async () => {
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);
    advanceTo(120);

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => expect(savesFor(phm)).toHaveLength(1));
    expect(savesFor(phm)[0].body).toMatchObject({ position_seconds: 120 });
  });
});

describe("what gets saved", () => {
  it("marks a book finished when it plays out", async () => {
    const phm = book({ title: "Project Hail Mary", duration_seconds: 3600 });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);

    advanceTo(3600);
    endCurrentTrack();

    await waitFor(() => expect(savesFor(phm).at(-1)?.body).toMatchObject({ completed: true }));
  });

  it("keeps the speed with the position", async () => {
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([phm]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);

    await user.selectOptions(within(player()).getByLabelText("Playback speed"), "1.25");

    await waitFor(() => expect(savesFor(phm).at(-1)?.body).toMatchObject({ playback_speed: 1.25 }));
  });

  it("flushes the outgoing book before switching to another", async () => {
    const first = book({ title: "First Book" });
    const second = book({ title: "Second Book" });
    givenSavedState(first, state({ media_id: first.id, position_seconds: 0 }));
    givenSavedState(second, state({ media_id: second.id, position_seconds: 0 }));
    givenLibrary([first, second]);

    render(<App />);
    await playRow("First Book");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(3600);
    advanceTo(90);

    await playRow("Second Book");

    await waitFor(() => expect(savesFor(first)).not.toHaveLength(0));
    expect(savesFor(first)[0].body).toMatchObject({ position_seconds: 90 });
  });
});

describe("songs are untouched by any of it", () => {
  it("never reads or writes a position for a song", async () => {
    const nightcall = song({ title: "Nightcall" });
    givenLibrary([nightcall]);

    render(<App />);
    await playRow("Nightcall");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    givenMetadata(258);

    advanceTo(60);
    hidePage();
    showPage();
    await user.click(within(player()).getByRole("button", { name: "Pause" }));
    endCurrentTrack();

    expect(stateRequests()).toEqual([]);
  });

  it("offers the skip controls for a book and not for a song", async () => {
    const phm = book({ title: "Project Hail Mary" });
    givenSavedState(phm, state({ media_id: phm.id, position_seconds: 0 }));
    givenLibrary([song({ title: "Nightcall" }), phm]);

    render(<App />);
    await playRow("Nightcall");
    await waitFor(() => expect(mediaElement().paused).toBe(false));

    expect(within(player()).queryByRole("button", { name: "Back 15 seconds" })).toBeNull();
    expect(within(player()).queryByRole("button", { name: "Forward 30 seconds" })).toBeNull();

    await playRow("Project Hail Mary");

    const back = await within(player()).findByRole("button", { name: "Back 15 seconds" });
    const forward = within(player()).getByRole("button", { name: "Forward 30 seconds" });

    advanceTo(100);
    await user.click(back);
    expect(mediaElement().currentTime).toBe(85);
    await user.click(forward);
    expect(mediaElement().currentTime).toBe(115);
  });
});
