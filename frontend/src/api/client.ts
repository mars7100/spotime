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

/** The server normalises (lowercase, trim, dedupe) and hands back the record. */
export const setTags = async (id: string, tags: string[]): Promise<MediaRecord> =>
  normalize(
    await request<MediaRecord>(`/api/media/${id}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    }),
  );

export const deleteMedia = (id: string): Promise<void> =>
  request(`/api/media/${id}`, { method: "DELETE" });

/** One request for a whole selection; ids that no longer exist are skipped. */
export const bulkDelete = (ids: string[]): Promise<{ deleted: number }> =>
  request("/api/media/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) });

/* ---------------------------------------------------------------------------
   Uploads. Three steps, and the middle one is not here: the bytes go straight
   to storage from the browser, so only the first and third talk to our server.
   --------------------------------------------------------------------------- */

/** Where to PUT the bytes, and the id the record will be registered under. */
export interface UploadTarget {
  id: string;
  key: string;
  /** A signed GCS URL in cloud mode; `/api/local-upload/…` on local disk. */
  url: string;
  method: string;
  /** Sent verbatim — Content-Type is part of the GCS signature. */
  headers: Record<string, string>;
}

export const createUploadTarget = (
  filename: string,
  contentType: string,
): Promise<UploadTarget> =>
  request("/api/media/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename, content_type: contentType }),
  });

/** The metadata the browser read out of the file, plus the book it belongs to. */
export interface RegisterBody {
  id: string;
  filename: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  media_type: "music" | "audiobook";
  cover_base64: string | null;
  book_id: string | null;
  book_title: string | null;
  track_number: number | null;
}

/** Returns the record — the existing one if the server recognised a duplicate. */
export const registerMedia = async (body: RegisterBody): Promise<MediaRecord> =>
  normalize(
    await request<MediaRecord>("/api/media/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
