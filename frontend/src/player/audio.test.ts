/* The element's own contract. The app-level tests drive playback through the
   UI; these pin the two things the element itself promises, which is where the
   whole port's riskiest bug lives. */
import { describe, expect, it, vi } from "vitest";
import { audio, loadSource, loadedSourceId, resetPlayback } from "./audio";

describe("the media element", () => {
  it("is the only one, and lives outside any render tree", () => {
    expect(document.querySelectorAll("audio")).toHaveLength(1);
    expect(document.querySelector("audio")).toBe(audio);
    expect(audio.closest("#root")).toBeNull();
  });

  it("records which source is loaded", () => {
    resetPlayback();
    expect(loadedSourceId()).toBeNull();

    loadSource("track-1", "/stream/track-1");

    expect(loadedSourceId()).toBe("track-1");
    expect(audio.getAttribute("src")).toBe("/stream/track-1");
  });

  it("does not deliver a replaced source's end-of-playback event", () => {
    const first = vi.fn();
    const second = vi.fn();
    loadSource("track-1", "/stream/track-1", { onEnded: first });
    loadSource("track-2", "/stream/track-2", { onEnded: second });

    audio.dispatchEvent(new Event("ended"));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("does not let a replaced source's metadata seek the track that displaced it", () => {
    // A resume seek fired here would move the *new* track to the old one's
    // saved position — the position bug the whole app exists to avoid.
    const first = vi.fn();
    const second = vi.fn();
    loadSource("track-1", "/stream/track-1", { onLoaded: first });
    loadSource("track-2", "/stream/track-2", { onLoaded: second });

    audio.dispatchEvent(new Event("loadedmetadata"));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
