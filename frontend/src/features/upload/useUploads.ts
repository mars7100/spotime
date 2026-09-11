/* The upload batch, as state.
   One batch at a time, files uploaded one after another: a book of forty
   chapters should not open forty parallel connections, and a queue that
   finishes in order is a queue you can read. Each track is registered as it
   lands, so the library fills in as the batch runs rather than all at the end. */
import { useCallback, useRef, useState } from "react";
import { getLibrary } from "../../api/client";
import { notifyLibraryChanged } from "../library/refresh";
import type { SelectedFile } from "./files";
import { isAudioFile, readTags } from "./metadata";
import { booksByTitle, planBooks, withoutAlreadyInLibrary, type PickedFile } from "./plan";
import { uploadUnit } from "./upload";

export type RowStatus = "waiting" | "reading" | "sending" | "finishing" | "done" | "failed";

export interface UploadRow {
  key: string;
  name: string;
  status: RowStatus;
  /** 0–1, and only meaningful while sending. */
  progress: number;
  /** The failure, naming the step it happened at. */
  error: string | null;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export interface Uploads {
  rows: UploadRow[];
  /** What the batch as a whole is doing, or how it ended. */
  note: string | null;
  busy: boolean;
  add: (selected: SelectedFile[]) => Promise<void>;
}

export function useUploads(): Uploads {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State lags a render behind; the guard has to read the truth immediately.
  const running = useRef(false);

  const add = useCallback(async (selected: SelectedFile[]) => {
    if (running.current) {
      setNote("Still adding the last batch — try again once it finishes.");
      return;
    }
    const audio = selected.filter((s) => isAudioFile(s.file.name));
    if (audio.length === 0) {
      setRows([]);
      setNote("No audio files in that selection.");
      return;
    }

    running.current = true;
    setBusy(true);
    setRows([]);
    try {
      setNote(`Reading ${plural(audio.length, "file")}…`);
      const picked: PickedFile[] = await Promise.all(
        audio.map(async ({ file, path }) => ({ file, path, tags: await readTags(file) })),
      );

      // The library is needed twice: to reuse an existing book's id, and to
      // recognise a file that is already in it.
      let library;
      try {
        library = await getLibrary();
      } catch (err) {
        setNote(`Couldn’t check your library first: ${messageOf(err)}`);
        return;
      }

      const units = planBooks(picked, booksByTitle(library));
      const { queue, skipped } = withoutAlreadyInLibrary(units, library);
      if (queue.length === 0) {
        setNote(`Already in your library — ${plural(skipped, "file")}, nothing to add.`);
        return;
      }

      setRows(
        queue.map((unit, i) => ({
          key: `${i}-${unit.file.name}`,
          name: unit.file.name,
          status: "waiting",
          progress: 0,
          error: null,
        })),
      );
      setNote(null);

      const patch = (index: number, next: Partial<UploadRow>) =>
        setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));

      let added = 0;
      let failed = 0;
      for (const [i, unit] of queue.entries()) {
        try {
          await uploadUnit(unit, {
            onReading: () => patch(i, { status: "reading" }),
            onProgress: (fraction) => patch(i, { status: "sending", progress: fraction }),
            onRegistering: () => patch(i, { status: "finishing", progress: 1 }),
          });
          added += 1;
          patch(i, { status: "done", progress: 1 });
          // Each track appears in the library the moment it is registered.
          notifyLibraryChanged();
        } catch (err) {
          failed += 1;
          patch(i, { status: "failed", error: messageOf(err) });
        }
      }

      setNote(
        [
          `Added ${added} of ${plural(queue.length, "file")}`,
          skipped > 0 ? `${skipped} already in your library` : null,
          failed > 0 ? `${plural(failed, "failure")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { rows, note, busy, add };
}
