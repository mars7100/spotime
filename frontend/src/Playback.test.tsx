/* Playback, driven at the app's network boundary — same seam as App.test.tsx.
   The tests click rows and press buttons, and assert on what a person sees and
   on what the app asked the element and the server to do. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { book, song } from "./test/fixtures";
import { givenLibrary, http, HttpResponse, requests, server, streamUrl } from "./test/server";
import { advanceTo, endCurrentTrack, givenMetadata, mediaElement } from "./test/media";

const user = userEvent.setup();

const player = () => screen.getByRole("contentinfo", { name: "Player" });
const playRow = async (title: string) =>
  user.click(await screen.findByRole("button", { name: `Play ${title}` }));
const loadedSrc = () => mediaElement().getAttribute("src");
const stateRequests = () => requests.filter((r) => r.path.includes("/state"));

describe("playing music", () => {
  it("plays the track you click", async () => {
    const nightcall = song({ title: "Nightcall" });
    givenLibrary([nightcall]);

    render(<App />);
    await playRow("Nightcall");

    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(nightcall.id)));
    expect(mediaElement().paused).toBe(false);
    expect(within(player()).getByText("Nightcall")).toBeInTheDocument();
  });

  it("starts a song at zero and never saves a position for it", async () => {
    // A song keeps no position by design — enforced server-side in
    // `_keeps_state`. The client's half of that rule is not to ask at all.
    const sedona = song({ title: "Sedona" });
    givenLibrary([sedona]);

    render(<App />);
    await playRow("Sedona");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(sedona.id)));

    expect(mediaElement().currentTime).toBe(0);
    expect(stateRequests()).toEqual([]);

    // Still nothing saved once it has been playing for a while.
    advanceTo(45);
    endCurrentTrack();
    expect(stateRequests()).toEqual([]);
  });

  it("reflects actual playback state on the play control", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");

    const pause = await within(player()).findByRole("button", { name: "Pause" });
    await user.click(pause);
    expect(mediaElement().paused).toBe(true);

    await user.click(within(player()).getByRole("button", { name: "Play" }));
    expect(mediaElement().paused).toBe(false);
  });

  it("shows elapsed and total time, and seeks where you scrub", async () => {
    givenLibrary([song({ title: "Tadow", duration_seconds: 303 })]);

    render(<App />);
    await playRow("Tadow");
    givenMetadata(303);

    const bar = player();
    expect(await within(bar).findByText("5:03")).toBeInTheDocument();
    expect(within(bar).getByText("0:00")).toBeInTheDocument();

    fireEvent.change(within(bar).getByLabelText("Seek"), { target: { value: "90" } });

    expect(mediaElement().currentTime).toBe(90);
    expect(await within(bar).findByText("1:30")).toBeInTheDocument();
  });

  it("marks the playing row with an accent rail rather than a tint alone", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");

    const row = (await screen.findAllByText("Nightcall"))[0].closest("li");
    await waitFor(() => expect(row).toHaveClass("row--playing"));
  });
});

describe("the queue", () => {
  it("hands off to the next track when one finishes", async () => {
    const [a, b] = [song({ title: "First" }), song({ title: "Second" })];
    givenLibrary([a, b]);

    render(<App />);
    await playRow("First");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(a.id)));

    endCurrentTrack();

    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(b.id)));
    expect(within(player()).getByText("Second")).toBeInTheDocument();
  });

  it("stops at the end of the list rather than wrapping round", async () => {
    const last = song({ title: "Only" });
    givenLibrary([last]);

    render(<App />);
    await playRow("Only");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(last.id)));

    endCurrentTrack();

    expect(loadedSrc()).toBe(streamUrl(last.id));
  });

  it("moves through the queue with previous and next", async () => {
    const [a, b] = [song({ title: "First" }), song({ title: "Second" })];
    givenLibrary([a, b]);

    render(<App />);
    await playRow("First");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(a.id)));

    await user.click(within(player()).getByRole("button", { name: "Next track" }));
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(b.id)));

    await user.click(within(player()).getByRole("button", { name: "Previous track" }));
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(a.id)));
  });

  it("leaves books out of the music queue", async () => {
    // A book advances chapter-to-chapter on its own; it must not be handed the
    // next song in the library when it ends.
    const audiobook = book({ title: "Project Hail Mary" });
    givenLibrary([audiobook, song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Project Hail Mary");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(audiobook.id)));

    endCurrentTrack();

    expect(loadedSrc()).toBe(streamUrl(audiobook.id));
  });

  it("does not let a finished track's late event skip the track that replaced it", async () => {
    /* The bug this guards: A ends, the hand-off to B is in flight, and A's
       `ended` lands on the element that is now B's. Stepping from "what is
       playing now" there would jump straight to C and swallow B. */
    const [a, b, c] = [song({ title: "A" }), song({ title: "B" }), song({ title: "C" })];
    givenLibrary([a, b, c]);

    // Hold the *first* request for B, so the click's hand-off is still in
    // flight when A's event lands.
    let inFlight = false;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("/api/media/:id/play", async ({ params }) => {
        if (params.id === b.id && !inFlight) {
          inFlight = true;
          await held;
        }
        return HttpResponse.json({ url: streamUrl(String(params.id)) });
      }),
    );

    render(<App />);
    await playRow("A");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(a.id)));

    await playRow("B");
    await waitFor(() => expect(inFlight).toBe(true));

    endCurrentTrack(); // A's event, arriving late
    release();

    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(b.id)));
    expect(within(player()).getByText("B")).toBeInTheDocument();
    expect(loadedSrc()).not.toBe(streamUrl(c.id));
  });
});

describe("secondary controls", () => {
  it("changes playback speed and applies it to the element", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");

    await user.selectOptions(within(player()).getByLabelText("Playback speed"), "1.5");

    expect(mediaElement().playbackRate).toBe(1.5);
  });

  it("changes volume and applies it to the element", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");

    fireEvent.change(within(player()).getByLabelText("Volume"), { target: { value: "0.25" } });

    expect(mediaElement().volume).toBeCloseTo(0.25);
  });

  it("shuffles without dropping or duplicating what is queued", async () => {
    const titles = ["One", "Two", "Three", "Four"];
    givenLibrary(titles.map((title) => song({ title })));

    render(<App />);
    await playRow("One");

    const shuffle = within(player()).getByRole("button", { name: "Shuffle" });
    expect(shuffle).toHaveAttribute("aria-pressed", "false");
    await user.click(shuffle);
    expect(shuffle).toHaveAttribute("aria-pressed", "true");

    // Walk the shuffled queue to its end: every track plays exactly once, and
    // the track already playing stays at the head rather than being yanked.
    const played = [nowPlayingTitle()];
    for (let i = 1; i < titles.length; i += 1) {
      const before = nowPlayingTitle();
      endCurrentTrack();
      await waitFor(() => expect(nowPlayingTitle()).not.toBe(before));
      played.push(nowPlayingTitle());
    }

    expect(played[0]).toBe("One");
    expect([...played].sort()).toEqual([...titles].sort());
  });
});

const nowPlayingTitle = () => within(player()).getByText(/One|Two|Three|Four/).textContent;
