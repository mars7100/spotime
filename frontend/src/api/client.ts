/* The one place the app talks to the server.
   Everything else calls these functions; nothing else issues a request. The API
   is unchanged by the port — no new endpoints, no changed payloads. */
import type { AudiobookRecord, MediaRecord, PlaybackState } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (res.status === 401) {
    // The password gate; the login page is deliberately outside the app.
    window.location.href = "/login.html";
    throw new ApiError(401, "unauthorized");
  }
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/* JSON arrives untyped, and a bad payload must not be able to smuggle a position
   onto a song. Normalising here keeps the discriminated union honest at runtime,
   so nothing downstream has to re-check it. */
function normalize(raw: MediaRecord): MediaRecord {
  const base = { ...raw, tags: raw.tags ?? [] };
  return base.media_type === "audiobook"
    ? { ...base, media_type: "audiobook", state: base.state ?? null }
    : { ...base, media_type: "music", state: null };
}

export const getLibrary = async (search?: string): Promise<MediaRecord[]> => {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return (await request<MediaRecord[]>(`/api/media${qs}`)).map(normalize);
};

export const getMedia = async (id: string): Promise<MediaRecord> =>
  normalize(await request<MediaRecord>(`/api/media/${id}`));

/** Local: a stream path on this origin. GCS: a short-lived signed URL. */
export const getPlayUrl = (id: string): Promise<{ url: string }> =>
  request(`/api/media/${id}/play`);

/** Only meaningful for audiobooks — the server hands back a blank state for a song. */
export const getState = (item: AudiobookRecord): Promise<PlaybackState> =>
  request(`/api/media/${item.id}/state`);

/** `keepalive` lets a save issued as the page goes away outlive the document;
    without it the browser cancels the request and the last minutes are lost. */
export const putState = (
  item: AudiobookRecord,
  update: { position_seconds: number; playback_speed?: number; completed?: boolean },
  { keepalive = false } = {},
): Promise<PlaybackState> =>
  request(`/api/media/${item.id}/state`, {
    method: "PUT",
    body: JSON.stringify(update),
    keepalive,
  });

export const artworkUrl = (item: MediaRecord | { id: string; artwork_path: string | null }) =>
  item.artwork_path ? `/api/media/${item.id}/artwork` : null;
