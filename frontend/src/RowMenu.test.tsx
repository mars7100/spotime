/* Acting on one row, at the app's network boundary.
   The row menu edits tags and deletes behind the browser's own prompt and
   confirm, so those are stubbed; everything else — the menu, the request, the
   refreshed row — is the real thing. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { MediaRecord } from "./api/types";
import { song } from "./test/fixtures";
import { mediaElement } from "./test/media";
import { http, HttpResponse, requests, server } from "./test/server";

const shownTitles = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector(".row-title")?.textContent ?? "");

/** A library the server mutates in place, so a refetch shows the edit. */
function givenMutableLibrary(initial: MediaRecord[]) {
  let library = initial;
  server.use(
    http.get("/api/media", () => HttpResponse.json(library)),
    http.put("/api/media/:id/tags", async ({ params, request }) => {
      const { tags } = (await request.json()) as { tags: string[] };
      library = library.map((it) => (it.id === params.id ? { ...it, tags } : it));
      return HttpResponse.json(library.find((it) => it.id === params.id));
    }),
    http.delete("/api/media/:id", ({ params }) => {
      library = library.filter((it) => it.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

const openMenu = async (title: string) => {
  await userEvent.click(screen.getByRole("button", { name: `More for ${title}` }));
  return screen.findByRole("menu");
};

afterEach(() => vi.restoreAllMocks());

describe("row menu", () => {
  it("edits a track's tags and shows them in the row and the tag filter", async () => {
    const nightcall = song({ title: "Nightcall", tags: ["night"] });
    givenMutableLibrary([nightcall, song({ title: "Tadow", tags: ["jazz"] })]);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("night, synth");
    render(<App />);
    await screen.findByText("Nightcall");

    const menu = await openMenu("Nightcall");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Edit tags" }));

    expect(prompt).toHaveBeenCalledWith("Tags (comma-separated):", "night");
    const row = screen.getByText("Nightcall").closest("li")!;
    await waitFor(() => expect(within(row).getByText("synth")).toBeInTheDocument());
    expect(requests).toContainEqual({
      method: "PUT",
      path: `/api/media/${nightcall.id}/tags`,
      body: { tags: ["night", "synth"] },
    });

    await userEvent.click(screen.getByLabelText("Filter by tag"));
    const list = await screen.findByRole("listbox", { name: "Matching tags" });
    expect(within(list).getByRole("option", { name: "synth, 1 track" })).toBeInTheDocument();
  });

  it("deletes a track once the deletion is confirmed", async () => {
    const tadow = song({ title: "Tadow" });
    givenMutableLibrary([song({ title: "Nightcall" }), tadow]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByText("Tadow");

    const menu = await openMenu("Tadow");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledWith('Delete "Tadow"?');
    await waitFor(() => expect(shownTitles()).toEqual(["Nightcall"]));
    expect(requests).toContainEqual(
      expect.objectContaining({ method: "DELETE", path: `/api/media/${tadow.id}` }),
    );
  });

  it("leaves the track alone when the deletion is declined", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" })]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await screen.findByText("Tadow");

    const menu = await openMenu("Tadow");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    expect(shownTitles()).toEqual(["Nightcall", "Tadow"]);
    expect(requests.filter((r) => r.method === "DELETE")).toEqual([]);
  });

  it("does not start playback when the menu is opened", async () => {
    givenMutableLibrary([song({ title: "Nightcall" })]);
    render(<App />);
    await screen.findByText("Nightcall");

    await openMenu("Nightcall");

    expect(mediaElement().src).toBe("");
    expect(requests.filter((r) => r.path.endsWith("/play"))).toEqual([]);
  });

  it("keeps only one menu open at a time", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" })]);
    render(<App />);
    await screen.findByText("Tadow");

    await openMenu("Nightcall");
    await openMenu("Tadow");

    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });

  it("stops playback when the playing track is deleted", async () => {
    const tadow = song({ title: "Tadow" });
    givenMutableLibrary([song({ title: "Nightcall" }), tadow]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByText("Tadow");
    await userEvent.click(screen.getByRole("button", { name: "Play Tadow" }));
    await screen.findByRole("contentinfo", { name: "Player" });

    const menu = await openMenu("Tadow");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByRole("contentinfo", { name: "Player" })).not.toBeInTheDocument(),
    );
    expect(mediaElement().paused).toBe(true);
    expect(mediaElement().getAttribute("src")).toBeNull();
  });
});
