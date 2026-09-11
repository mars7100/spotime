/* Feedback and keyboard, at the app's network boundary.
   Every action leaves a transient message in a live region rather than a
   blocking alert, and the kind tabs move under the arrow keys. */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { MediaRecord } from "./api/types";
import { book, song } from "./test/fixtures";
import { givenLibrary, http, HttpResponse, server } from "./test/server";

const shownTitles = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector(".row-title")?.textContent ?? "");

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
    http.post("/api/media/tags/bulk", async ({ request }) => {
      const { ids, add } = (await request.json()) as { ids: string[]; add: string[] };
      library = library.map((it) =>
        ids.includes(it.id) ? { ...it, tags: [...it.tags, ...add] } : it,
      );
      return HttpResponse.json({ updated: ids.length });
    }),
  );
}

const menuAction = async (title: string, action: string) => {
  await userEvent.click(screen.getByRole("button", { name: `More for ${title}` }));
  const menu = await screen.findByRole("menu");
  await userEvent.click(within(menu).getByRole("menuitem", { name: action }));
};

afterEach(() => vi.restoreAllMocks());

describe("transient messages", () => {
  it("confirms a tag edit, then lets the message go", async () => {
    givenMutableLibrary([song({ title: "Nightcall" })]);
    vi.spyOn(window, "prompt").mockReturnValue("night");
    render(<App />);
    await screen.findByText("Nightcall");

    await menuAction("Nightcall", "Edit tags");

    const message = await screen.findByText("Tags saved");
    expect(message.closest("[role=status]")).not.toBeNull();

    // It is a confirmation, not a banner: it clears itself.
    await waitFor(() => expect(screen.queryByText("Tags saved")).toBeNull(), { timeout: 4000 });
  }, 8000);

  it("reports a failed tag save without a blocking alert", async () => {
    givenLibrary([song({ title: "Nightcall" })]);
    server.use(http.put("/api/media/:id/tags", () => HttpResponse.json({}, { status: 500 })));
    vi.spyOn(window, "prompt").mockReturnValue("night");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<App />);
    await screen.findByText("Nightcall");

    await menuAction("Nightcall", "Edit tags");

    await screen.findByText("Could not save tags");
    expect(alert).not.toHaveBeenCalled();
  });

  it("confirms a deletion", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" })]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByText("Tadow");

    await menuAction("Tadow", "Delete");

    await screen.findByText("Deleted");
    await waitFor(() => expect(shownTitles()).toEqual(["Nightcall"]));
  });

  it("confirms a bulk tag add with the count it touched", async () => {
    givenMutableLibrary([song({ title: "Nightcall" }), song({ title: "Tadow" })]);
    render(<App />);
    await screen.findByText("Tadow");

    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Nightcall" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Tadow" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "night");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await screen.findByText("Added to 2 track(s)");
  });
});

describe("the kind tabs by keyboard", () => {
  const LIBRARY = [song({ title: "Nightcall" }), book({ title: "Project Hail Mary" })];

  it("moves to the next tab on ArrowRight and narrows the list", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await screen.findByText("Nightcall");

    act(() => screen.getByRole("tab", { name: "All" }).focus());
    await userEvent.keyboard("{ArrowRight}");

    const music = screen.getByRole("tab", { name: "Music" });
    expect(music).toHaveAttribute("aria-selected", "true");
    expect(music).toHaveFocus();
    expect(shownTitles()).toEqual(["Nightcall"]);
  });

  it("wraps from the first tab to the last on ArrowLeft", async () => {
    givenLibrary(LIBRARY);
    render(<App />);
    await screen.findByText("Nightcall");

    act(() => screen.getByRole("tab", { name: "All" }).focus());
    await userEvent.keyboard("{ArrowLeft}");

    const books = screen.getByRole("tab", { name: "Audiobooks" });
    expect(books).toHaveAttribute("aria-selected", "true");
    expect(books).toHaveFocus();
    expect(shownTitles()).toEqual(["Project Hail Maryaudiobook"]); // title + its kind badge
  });
});
