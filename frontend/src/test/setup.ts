import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetPlayback } from "../player/audio";
import {
  installMediaSessionStub,
  installMediaStub,
  resetMedia,
  resetMediaSession,
} from "./media";
import { requests, server } from "./server";

// jsdom's <audio> is inert; give it a controllable one before any module
// creates an element.
installMediaStub();
// Likewise the OS-controls surface, which jsdom does not implement at all.
installMediaSessionStub();
// jsdom's Blob has no stream(), which the request interceptor needs to read an
// upload body. Real browsers have had it for years; without it every upload
// test fails inside the fake network rather than in the app.
if (typeof Blob.prototype.stream !== "function") {
  Blob.prototype.stream = function stream(this: Blob) {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start: (controller) => {
        void this.arrayBuffer().then((buffer) => {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        });
      },
    });
  };
}

// An unhandled request is a test bug: the app asked for something the test did
// not describe.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  // The media element deliberately outlives the render tree, so it outlives a
  // test too — hand the next one a silent, unloaded player.
  resetPlayback();
  resetMedia();
  resetMediaSession();
  // Shuffle and volume are remembered between sessions; not between tests.
  localStorage.clear();
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => server.close());
