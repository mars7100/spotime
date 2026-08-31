import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetPlayback } from "../player/audio";
import { installMediaStub, resetMedia } from "./media";
import { requests, server } from "./server";

// jsdom's <audio> is inert; give it a controllable one before any module
// creates an element.
installMediaStub();

// An unhandled request is a test bug: the app asked for something the test did
// not describe.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  // The media element deliberately outlives the render tree, so it outlives a
  // test too — hand the next one a silent, unloaded player.
  resetPlayback();
  resetMedia();
  // Shuffle and volume are remembered between sessions; not between tests.
  localStorage.clear();
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => server.close());
