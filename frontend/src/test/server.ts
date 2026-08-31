/* HTTP is faked at the network boundary, not inside the app: tests exercise the
   real client module and the real fetch call, and assert on what the app renders
   and what it asks the server for. */
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { AudiobookRecord, MediaRecord, PlaybackState } from "../api/types";

/* The play-URL endpoint answers by default: nearly every test that touches
   playback needs it, and what it returns (a stream path on this origin locally,
   a signed URL in cloud mode) is not what any test is about. Requests to it are
   still recorded, so a test can assert that it was asked. */
export const server = setupServer(
  http.get("/api/media/:id/play", ({ params }) =>
    HttpResponse.json({ url: `/stream/${params.id}` }),
  ),
  /* An untouched record, which is what the server returns for a book nobody has
     opened. A test that cares about a saved position calls `givenSavedState`;
     one that does not still must not 404 its way out of playing. */
  http.get("/api/media/:id/state", ({ params }) =>
    HttpResponse.json({
      media_id: params.id,
      position_seconds: 0,
      playback_speed: 1,
      completed: false,
    }),
  ),
  http.put("/api/media/:id/state", async ({ params, request }) =>
    HttpResponse.json({ media_id: params.id, ...((await request.json()) as object) }),
  ),
);

/** The stream URL the default handler hands back for a given record. */
export const streamUrl = (id: string) => `/stream/${id}`;

/** Every request the app made, in order — the other half of what a test asserts. */
export const requests: { method: string; path: string; body?: unknown }[] = [];

server.events.on("request:start", async ({ request }) => {
  const url = new URL(request.url);
  let body: unknown;
  try {
    body = request.method === "GET" ? undefined : await request.clone().json();
  } catch {
    body = undefined;
  }
  requests.push({ method: request.method, path: url.pathname + url.search, body });
});

export function givenLibrary(items: MediaRecord[]) {
  server.use(http.get("/api/media", () => HttpResponse.json(items)));
}

/* The saved position, as the server would hand it back. Only audiobooks have
   one — a test that needs this for a song is describing something the app must
   never ask for. */
export function givenSavedState(item: AudiobookRecord, state: PlaybackState) {
  server.use(http.get(`/api/media/${item.id}/state`, () => HttpResponse.json(state)));
  server.use(
    http.put(`/api/media/${item.id}/state`, async ({ request }) =>
      HttpResponse.json({ ...state, ...((await request.json()) as object) }),
    ),
  );
}

/** Every save the app issued for a record, in order. */
export const savesFor = (item: AudiobookRecord) =>
  requests.filter((r) => r.method === "PUT" && r.path === `/api/media/${item.id}/state`);

export { http, HttpResponse };
