/* What the file already knows about itself.
   Tags, cover art and duration are read in the browser and sent as fields on
   the register call, so the server never needs the bytes to learn what the
   track is. A probe that cannot answer is not an error — it yields nothing and
   the upload carries on with what the filename gives us. */
import type { Tags } from "jsmediatags/types";

/** Extensions the backend accepts; anything else is dropped from a selection. */
const AUDIO_RE = /\.(mp3|m4a|m4b|aac|ogg|opus|flac|wav)$/i;

export const isAudioFile = (name: string) => AUDIO_RE.test(name);

/** A lone .m4b is a book; every other loose file is a song until proven a book
    by the folder it arrived in (see planBooks). */
export const guessMediaType = (name: string): "music" | "audiobook" =>
  name.toLowerCase().endsWith(".m4b") ? "audiobook" : "music";

/** No metadata probe may hold up the queue; after this it simply has no answer. */
const PROBE_TIMEOUT_MS = 8000;

function withTimeout<T>(work: Promise<T>, fallback: T, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** ID3 and friends. Loaded on demand: it is only needed once you add a file. */
export async function readTags(file: File): Promise<Tags> {
  const read = async () =>
    new Promise<Tags>((resolve) => {
      import("jsmediatags/dist/jsmediatags.min.js")
        .then((mod) => {
          (mod.default ?? mod).read(file, {
            onSuccess: (result) => resolve(result.tags ?? {}),
            onError: () => resolve({}),
          });
        })
        .catch(() => resolve({}));
    });
  return withTimeout(read(), {});
}

/** Duration, from a media element that loads only the file's metadata. */
export function readDuration(file: File): Promise<number | null> {
  // No object URLs (a non-browser DOM) means no probe; the column shows an em dash.
  if (typeof URL.createObjectURL !== "function") return Promise.resolve(null);
  const probe = new Promise<number | null>((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    el.src = url;
  });
  return withTimeout(probe, null);
}

/** The embedded cover, as the base64 the register endpoint expects. */
export function pictureToBase64(tags: Tags): string | null {
  const data = tags.picture?.data;
  if (!data || data.length === 0) return null;
  // Built in chunks: one apply() over a multi-megabyte cover blows the stack.
  let binary = "";
  for (let i = 0; i < data.length; i += 8192) {
    binary += String.fromCharCode(...data.slice(i, i + 8192));
  }
  try {
    return btoa(binary);
  } catch {
    return null;
  }
}

/** The leading integer of a track tag — "3" and "3/20" are both track 3. */
export function parseTrackNumber(track: string | undefined): number | null {
  const match = /^\s*(\d+)/.exec(String(track ?? ""));
  return match ? Number.parseInt(match[1], 10) : null;
}
