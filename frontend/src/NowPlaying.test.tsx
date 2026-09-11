/* The full-screen now-playing view and the operating system's media controls,
   driven at the app's network boundary like the rest.

   The load-bearing claim is that expanding is a re-flow rather than a second
   player, so the tests check it the way it would actually break: the element
   that is playing, and the region it lives in, must be the very same nodes
   afterwards, still playing the same source, with no fresh play request.

   Artwork size and layout are not asserted — per the spec those are reviewed by
   eye against the mockup. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { book, song } from "./test/fixtures";
import { givenLibrary, requests, streamUrl } from "./test/server";
import { givenMetadata, mediaElement, osControl, osNowPlaying } from "./test/media";

const user = userEvent.setup();

const player = () => screen.getByRole("contentinfo", { name: "Player" });
const playRow = async (title: string) =>
  user.click(await screen.findByRole("button", { name: `Play ${title}` }));
const loadedSrc = () => mediaElement().getAttribute("src");
const playRequests = () => requests.filter((r) => r.path.endsWith("/play"));

const expand = async () =>
  user.click(within(player()).getByRole("button", { name: "Expand to full screen" }));

describe("the full-screen now-playing view", () => {
  it("expands from the bar and collapses back to it", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");

    // The affordance is on the bar itself, not hidden behind a menu.
    const opener = within(player()).getByRole("button", { name: "Expand to full screen" });
    expect(opener).toHaveAttribute("aria-expanded", "false");

    await user.click(opener);
    expect(
      within(player()).getByRole("button", { name: "Collapse full-screen player" }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(within(player()).getByRole("button", { name: "Collapse player" }));
    expect(
      within(player()).getByRole("button", { name: "Expand to full screen" }),
    ).toBeInTheDocument();
  });

  it("collapses on Escape", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");
    await expand();

    await user.keyboard("{Escape}");

    expect(
      within(player()).getByRole("button", { name: "Expand to full screen" }),
    ).toBeInTheDocument();
  });

  it("re-flows the one player rather than mounting a second one", async () => {
    const nightcall = song({ title: "Nightcall" });
    givenLibrary([nightcall]);

    render(<App />);
    await playRow("Nightcall");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(nightcall.id)));

    const element = mediaElement();
    const region = player();
    const playsBefore = playRequests().length;

    await expand();
    // Same element, same region, same source, still playing.
    expect(mediaElement()).toBe(element);
    expect(player()).toBe(region);
    expect(loadedSrc()).toBe(streamUrl(nightcall.id));
    expect(element.paused).toBe(false);
    expect(document.querySelectorAll("audio")).toHaveLength(1);

    await user.click(within(player()).getByRole("button", { name: "Collapse player" }));
    expect(mediaElement()).toBe(element);
    expect(player()).toBe(region);
    expect(loadedSrc()).toBe(streamUrl(nightcall.id));
    expect(element.paused).toBe(false);

    // Nothing was re-fetched, so nothing was re-loaded.
    expect(playRequests()).toHaveLength(playsBefore);
  });

  it("keeps every transport control working while expanded", async () => {
    const [first, second] = [song({ title: "First" }), song({ title: "Second" })];
    givenLibrary([first, second]);

    render(<App />);
    await playRow("First");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(first.id)));
    givenMetadata(240);
    await expand();

    const view = () => within(player());

    await user.click(await view().findByRole("button", { name: "Pause" }));
    expect(mediaElement().paused).toBe(true);
    await user.click(view().getByRole("button", { name: "Play" }));
    expect(mediaElement().paused).toBe(false);

    await user.click(view().getByRole("button", { name: "Next track" }));
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(second.id)));

    await user.click(view().getByRole("button", { name: "Previous track" }));
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(first.id)));

    // The scrubber and the secondary controls came along too.
    expect(view().getByLabelText("Seek")).toBeInTheDocument();
    expect(view().getByLabelText("Volume")).toBeInTheDocument();

    // And the view survived all of it rather than snapping shut.
    expect(view().getByRole("button", { name: "Collapse player" })).toBeInTheDocument();
  });

  it("keeps the audiobook skip controls in the expanded view", async () => {
    givenLibrary([book({ title: "Project Hail Mary" })]);

    render(<App />);
    await playRow("Project Hail Mary");
    givenMetadata(3600);
    await expand();

    await user.click(within(player()).getByRole("button", { name: "Forward 30 seconds" }));
    expect(mediaElement().currentTime).toBe(30);

    await user.click(within(player()).getByRole("button", { name: "Back 15 seconds" }));
    expect(mediaElement().currentTime).toBe(15);
  });
});

describe("operating-system media controls", () => {
  it("describes what is playing", async () => {
    givenLibrary([song({ title: "Nightcall", artist: "Kavinsky", album: "OutRun" })]);

    render(<App />);
    await playRow("Nightcall");

    await waitFor(() => expect(osNowPlaying().metadata?.title).toBe("Nightcall"));
    expect(osNowPlaying().metadata?.artist).toBe("Kavinsky");
    expect(osNowPlaying().metadata?.album).toBe("OutRun");
    expect(osNowPlaying().playbackState).toBe("playing");
  });

  it("offers the artwork to the lock screen when the record has some", async () => {
    const nightcall = song({ title: "Nightcall", artwork_path: "art/nightcall.jpg" });
    givenLibrary([nightcall]);

    render(<App />);
    await playRow("Nightcall");

    await waitFor(() =>
      expect(osNowPlaying().metadata?.artwork[0]?.src).toBe(
        `/api/media/${nightcall.id}/artwork`,
      ),
    );
  });

  it("pauses and resumes from the OS", async () => {
    givenLibrary([song({ title: "Nightcall" })]);

    render(<App />);
    await playRow("Nightcall");
    await waitFor(() => expect(mediaElement().paused).toBe(false));

    osControl("pause");
    await waitFor(() => expect(mediaElement().paused).toBe(true));
    // The bar agrees, because it is the same action behind both.
    expect(within(player()).getByRole("button", { name: "Play" })).toBeInTheDocument();
    await waitFor(() => expect(osNowPlaying().playbackState).toBe("paused"));

    osControl("play");
    await waitFor(() => expect(mediaElement().paused).toBe(false));
    expect(within(player()).getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("skips tracks from the OS", async () => {
    const [first, second] = [song({ title: "First" }), song({ title: "Second" })];
    givenLibrary([first, second]);

    render(<App />);
    await playRow("First");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(first.id)));

    osControl("nexttrack");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(second.id)));
    expect(within(player()).getByText("Second")).toBeInTheDocument();

    osControl("previoustrack");
    await waitFor(() => expect(loadedSrc()).toBe(streamUrl(first.id)));
  });

  it("seeks from the OS, by an offset and to a point", async () => {
    givenLibrary([book({ title: "Project Hail Mary" })]);

    render(<App />);
    await playRow("Project Hail Mary");
    givenMetadata(3600);

    osControl("seekto", { seekTime: 900 });
    await waitFor(() => expect(mediaElement().currentTime).toBe(900));

    osControl("seekforward", { seekOffset: 30 });
    await waitFor(() => expect(mediaElement().currentTime).toBe(930));

    osControl("seekbackward", { seekOffset: 15 });
    await waitFor(() => expect(mediaElement().currentTime).toBe(915));
  });

  it("reports the position so the OS can draw a scrubber", async () => {
    givenLibrary([book({ title: "Project Hail Mary" })]);

    render(<App />);
    await playRow("Project Hail Mary");
    givenMetadata(3600);

    await waitFor(() => expect(osNowPlaying().position?.duration).toBe(3600));
    expect(osNowPlaying().position?.playbackRate).toBe(1);
  });
});
