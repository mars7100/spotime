/* The queue's invariants, as pure functions — cheap to state here, and awkward
   to pin from the app seam because shuffle is random by definition. */
import { describe, expect, it } from "vitest";
import { song, book } from "../test/fixtures";
import { buildQueue, queueable, shuffleOrder, stepFrom } from "./queue";

describe("the queue", () => {
  it("is the standalone music in view, in library order", () => {
    const [a, b] = [song({ title: "A" }), song({ title: "B" })];
    const chapter = book({ book_id: "b1" });
    const single = book({ title: "A Book" });

    expect(queueable([a, chapter, single, b]).map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("shuffles without dropping or duplicating a track", () => {
    const tracks = Array.from({ length: 30 }, (_, i) => song({ title: `T${i}` }));

    const shuffled = shuffleOrder(tracks);

    expect(shuffled).toHaveLength(tracks.length);
    expect(new Set(shuffled.map((t) => t.id)).size).toBe(tracks.length);
    expect([...shuffled].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...tracks].sort((x, y) => x.id.localeCompare(y.id)),
    );
  });

  it("keeps the playing track at the head when shuffle is switched on", () => {
    const tracks = Array.from({ length: 10 }, (_, i) => song({ title: `T${i}` }));
    const playing = tracks[6];

    const queue = buildQueue(tracks, { shuffle: true, pin: playing.id });

    expect(queue[0].id).toBe(playing.id);
    expect(new Set(queue.map((t) => t.id)).size).toBe(tracks.length);
  });

  it("stops at either end rather than wrapping", () => {
    const tracks = [song(), song(), song()];

    expect(stepFrom(tracks, tracks[0].id, -1)).toBeNull();
    expect(stepFrom(tracks, tracks[2].id, 1)).toBeNull();
    expect(stepFrom(tracks, tracks[0].id, 1)).toBe(tracks[1]);
    expect(stepFrom(tracks, "not-in-the-queue", 1)).toBeNull();
  });
});
