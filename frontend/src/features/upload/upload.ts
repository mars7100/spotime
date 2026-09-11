/* One file, all the way in.
   The three steps are: ask the server where to put it, send the bytes straight
   to storage, then register the record. Only the middle step carries audio, and
   it never touches the app. Each step's failure is labelled with the step, so a
   message can say what actually went wrong instead of "upload failed". */
import { createUploadTarget, registerMedia } from "../../api/client";
import type { MediaRecord } from "../../api/types";
import { pictureToBase64, readDuration } from "./metadata";
import type { UploadUnit } from "./plan";

export type UploadStep = "start" | "transfer" | "register";

const STEP_LABEL: Record<UploadStep, string> = {
  start: "couldn’t start the upload",
  transfer: "couldn’t send the file to storage",
  register: "couldn’t add it to your library",
};

export class UploadError extends Error {
  constructor(
    readonly step: UploadStep,
    readonly filename: string,
    readonly cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${filename} — ${STEP_LABEL[step]}: ${detail}`);
    this.name = "UploadError";
  }
}

const asStep = <T>(step: UploadStep, filename: string, work: Promise<T>): Promise<T> =>
  work.catch((err: unknown) => {
    throw new UploadError(step, filename, err);
  });

/* fetch cannot report how far a request body has got, and a book chapter is
   large enough that "moving" and "stuck" have to look different. XHR can. */
function putWithProgress(
  url: string,
  method: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`storage responded ${xhr.status}`));
    xhr.onerror = () => reject(new Error("the network dropped the transfer"));
    xhr.send(file);
  });
}

export interface UploadCallbacks {
  onReading?: () => void;
  onProgress?: (fraction: number) => void;
  onRegistering?: () => void;
}

/** Uploads one file and returns the record the server now holds for it. */
export async function uploadUnit(
  unit: UploadUnit,
  { onReading, onProgress, onRegistering }: UploadCallbacks = {},
): Promise<MediaRecord> {
  const { file, book, tags } = unit;
  // Tags were read while planning; only the duration is still unknown here.
  onReading?.();
  const duration = await readDuration(file);

  const contentType = file.type || "application/octet-stream";
  const target = await asStep("start", file.name, createUploadTarget(file.name, contentType));

  onProgress?.(0);
  await asStep(
    "transfer",
    file.name,
    putWithProgress(target.url, target.method, target.headers, file, (p) => onProgress?.(p)),
  );

  onRegistering?.();
  return asStep(
    "register",
    file.name,
    registerMedia({
      id: target.id,
      filename: file.name,
      title: tags.title || null,
      artist: tags.artist || null,
      album: tags.album || null,
      duration_seconds: duration,
      media_type: unit.mediaType,
      cover_base64: pictureToBase64(tags),
      book_id: book?.id ?? null,
      book_title: book?.title ?? null,
      track_number: unit.trackNumber,
    }),
  );
}
