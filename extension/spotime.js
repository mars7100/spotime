// Talking to the local Spotime server.
//
// The extension never downloads anything itself — MV3 can't run native binaries,
// so yt-dlp and ffmpeg stay on the machine. All this does is hand a URL to the
// server that already knows how to fetch it (see backend/downloader.py).
//
// Localhost only, on purpose. `make cloud` leaves SPOTIME_PASSWORD unset, so the
// API is open and `host_permissions` exempts our fetches from CORS — no backend
// changes needed. Pointing this at the deployed service would need the
// spotime_auth cookie, and YouTube blocks Cloud Run's IPs anyway.

export const HOSTS = ["http://localhost:8080", "http://127.0.0.1:8080"];

/** Thrown for anything the user can act on; `hint` is the suggested fix. */
export class SpotimeError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

const OFFLINE = new SpotimeError(
  "Spotime isn't running",
  "Start it with `make cloud` in the spotime folder, then try again."
);

const LOCKED = new SpotimeError(
  "Spotime rejected the request (401)",
  "The local server has SPOTIME_PASSWORD set. Run `make cloud` without it — the extension only talks to the open localhost setup."
);

async function tryHost(host, path, init, timeoutMs) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    return await fetch(host + path, { ...init, signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch from whichever loopback host answers. A refused connection means the
 * server is down; a 401 means it's up but password-gated. Both get a hint.
 */
export async function api(path, init = {}, timeoutMs = 5000) {
  let lastNetworkError = null;
  for (const host of HOSTS) {
    let res;
    try {
      res = await tryHost(host, path, init, timeoutMs);
    } catch (err) {
      lastNetworkError = err;   // refused / aborted — try the next host
      continue;
    }
    if (res.status === 401) throw LOCKED;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new SpotimeError(`Spotime returned ${res.status}`, detail.slice(0, 200));
    }
    return res.status === 204 ? null : res.json();
  }
  throw OFFLINE;
}

export async function startDownload(url, playlist, tags = []) {
  return api("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, playlist, tags }),
  });
}

export const getJob = (jobId) => api(`/api/download/${jobId}`);

/** Every tag already in the library, for the popup's picker. */
export async function knownTags() {
  const items = await api("/api/media");
  const seen = new Set();
  for (const item of items) for (const tag of item.tags || []) seen.add(tag);
  return [...seen].sort();
}

// ----- URL classification ----------------------------------------------------

/**
 * What a URL looks like it wants to be: a single track, a whole playlist, or a
 * watch page that happens to sit inside one (where only the user knows which
 * they meant, so the popup asks).
 *
 * Radio/mix lists (RD…) are auto-generated and effectively endless — never treat
 * one as a playlist, or MAX_ENTRIES worth of algorithmic filler lands in the library.
 */
export function classify(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "unsupported", url: rawUrl };
  }
  if (!/^https?:$/.test(url.protocol)) return { kind: "unsupported", url: rawUrl };

  const list = url.searchParams.get("list");
  const isMix = list ? /^(RD|UL|LM)/.test(list) : false;
  const onPlaylistPage =
    /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === "/playlist";

  if (onPlaylistPage) return { kind: "playlist", url: rawUrl, list, isMix };
  if (list && !isMix) return { kind: "ambiguous", url: rawUrl, list, isMix };
  return { kind: "track", url: rawUrl, list, isMix };
}

/** Strip the playlist context so a "just this one" download can't run away. */
export function trackOnly(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const param of ["list", "index", "start_radio", "pp"]) url.searchParams.delete(param);
    return url.toString();
  } catch {
    return rawUrl;
  }
}
