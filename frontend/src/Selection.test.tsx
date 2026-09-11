/* Acting on many rows at once, at the app's network boundary.
   Select mode is driven through the real toggle, checkboxes and bulk bar;
   only the browser's confirm is stubbed. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { MediaRecord } from "./api/types";
import { book, song } from "./test/fixtures";
import { mediaElement } from "./test/media";
import { http, HttpResponse, requests, server } from "./test/server";

const shownTitles = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector(".row-title")?.textContent ?? "");

const rowOf = (title: string) => screen.getByText(title).closest("li")!;

/** A library the server mutates in place, so a refetch shows the change. */
function givenMutableLibrary(initial: MediaRecord[]) {
  let library = initial;
  server.use(
    http.get("/api/media", () => HttpResponse.json(library)),
    http.post("/api/media/tags/bulk", async ({ request }) => {
      const { ids, add, remove } = (await request.json()) as {
        ids: string[];
        add: string[];
        remove: string[];
      };
      library = library.map((it) =>
        ids.includes(it.id)
          ? { ...it, tags: [...it.tags.filter((t) => !remove.includes(t)), ...add] }
          : it,
      );
      return HttpResponse.json({ updated: ids.length });
    }),
    http.post("/api/media/bulk-delete", async ({ request }) => {
      const { ids } = (await request.json()) as { ids: string[] };
      library = library.filter((it) => !ids.includes(it.id));
      return HttpResponse.json({ deleted: ids.length });
    }),
  );
}

const enterSelectMode = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Select" }));
  return screen.getByRole("button", { name: "Done" });
};

const select = (title: string) => userEvent.click(screen.getByRole("checkbox", { name: `Select ${title}` }));

const bulkBar = () => screen.getByRole("region", { name: "Bulk actions" });

const bulkRequests = () => requests.filter((r) => r.path === "/api/media/tags/bulk");

afterEach(() => vi.restoreAllMocks());

describe("select mode", () => {
  it("counts the selection as tracks are ticked and unticked", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" }), book()]);
    render(<App />);
    await screen.findByText("Nightcall");

    const done = await enterSelectMode();
    expect(done).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("checkbox", { name: "Select Project Hail Mary" })).toBeNull();

    await select("Nightcall");
    await select("Tadow");
    expect(within(bulkBar()).getByText("2 selected")).toBeInTheDocument();

    await select("Tadow");
    expect(within(bulkBar()).getByText("1 selected")).toBeInTheDocument();

    await userEvent.click(done);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "false");
  });

  it("adds a tag to every selected track in one request and keeps the selection", async () => {
    const a = song({ title: "Nightcall" });
    const b = song({ title: "Tadow" });
    givenMutableLibrary([a, b, song({ title: "Weightless" })]);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();
    await select("Nightcall");
    await select("Tadow");

    const add = within(bulkBar()).getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await userEvent.type(within(bulkBar()).getByRole("textbox", { name: "Tags" }), "night, synth");
    await userEvent.click(add);

    await waitFor(() => expect(within(rowOf("Nightcall")).getByText("synth")).toBeInTheDocument());
    expect(within(rowOf("Tadow")).getByText("night")).toBeInTheDocument();
    expect(within(rowOf("Weightless")).queryByText("night")).toBeNull();
    expect(bulkRequests()).toEqual([
      expect.objectContaining({ method: "POST", body: { ids: [a.id, b.id], add: ["night", "synth"], remove: [] } }),
    ]);
    expect(within(bulkBar()).getByText("2 selected")).toBeInTheDocument();
    expect(within(bulkBar()).getByRole("textbox", { name: "Tags" })).toHaveValue("");
  });

  it("removes a tag from every selected track in one request", async () => {
    const a = song({ title: "Nightcall", tags: ["night", "synth"] });
    const b = song({ title: "Tadow", tags: ["night"] });
    givenMutableLibrary([a, b]);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();
    await select("Nightcall");
    await select("Tadow");

    await userEvent.type(within(bulkBar()).getByRole("textbox", { name: "Tags" }), "night");
    await userEvent.click(within(bulkBar()).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(within(rowOf("Nightcall")).queryByText("night")).toBeNull());
    expect(within(rowOf("Nightcall")).getByText("synth")).toBeInTheDocument();
    expect(within(rowOf("Tadow")).queryByText("night")).toBeNull();
    expect(bulkRequests()).toEqual([
      expect.objectContaining({ body: { ids: [a.id, b.id], add: [], remove: ["night"] } }),
    ]);
  });

  it("deletes the selection once confirmed, naming what goes", async () => {
    const a = song({ title: "Nightcall" });
    const b = song({ title: "Tadow" });
    givenMutableLibrary([a, b, song({ title: "Weightless" })]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();
    await select("Nightcall");
    await select("Tadow");

    await userEvent.click(within(bulkBar()).getByRole("button", { name: "Delete" }));

    const message = vi.mocked(window.confirm).mock.calls[0][0] as string;
    expect(message.startsWith("Delete 2 track(s)? This cannot be undone.")).toBe(true);
    expect(message).toContain("Nightcall");
    expect(message).toContain("Tadow");
    await waitFor(() => expect(shownTitles()).toEqual(["Weightless"]));
    expect(requests).toContainEqual(
      expect.objectContaining({ method: "POST", path: "/api/media/bulk-delete", body: { ids: [a.id, b.id] } }),
    );
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("leaves the selection alone when the deletion is declined", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" })]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();
    await select("Nightcall");

    await userEvent.click(within(bulkBar()).getByRole("button", { name: "Delete" }));

    expect(shownTitles()).toEqual(["Nightcall", "Tadow"]);
    expect(requests.filter((r) => r.path === "/api/media/bulk-delete")).toEqual([]);
    expect(within(bulkBar()).getByText("1 selected")).toBeInTheDocument();
  });

  it("clears the selection without leaving select mode", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" })]);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();
    await select("Nightcall");
    await select("Tadow");

    await userEvent.click(within(bulkBar()).getByRole("button", { name: "Clear" }));

    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
  });

  it("acts on what was selected, not on what a filter has since left in view", async () => {
    const a = song({ title: "Nightcall" });
    const b = song({ title: "Tadow" });
    givenMutableLibrary([a, b]);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();
    await select("Nightcall");

    await userEvent.type(screen.getByLabelText("Search library"), "tadow");
    expect(shownTitles()).toEqual(["Tadow"]);
    await select("Tadow");
    expect(within(bulkBar()).getByText("2 selected")).toBeInTheDocument();

    await userEvent.type(within(bulkBar()).getByRole("textbox", { name: "Tags" }), "jazz");
    await userEvent.click(within(bulkBar()).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(bulkRequests()).toHaveLength(1));
    expect(bulkRequests()[0].body).toEqual({ ids: [a.id, b.id], add: ["jazz"], remove: [] });
  });

  it("does not start playback when a track is selected", async () => {
    givenMutableLibrary([song({ title: "Nightcall" })]);
    render(<App />);
    await screen.findByText("Nightcall");
    await enterSelectMode();

    await select("Nightcall");

    expect(mediaElement().src).toBe("");
    expect(requests.filter((r) => r.path.endsWith("/play"))).toEqual([]);
  });
});
