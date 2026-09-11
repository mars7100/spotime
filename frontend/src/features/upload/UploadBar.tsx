/* Adding audio from disk.
   Three ways in — pick files, pick a folder, or drop either onto the window —
   and one queue underneath them all, because a folder of chapters is the case
   that actually needs watching. */
import { useEffect, useRef, useState } from "react";
import { IconUpload } from "../../ui/icons";
import { fromDataTransfer, fromInput, type SelectedFile } from "./files";
import { useUploads, type UploadRow } from "./useUploads";
import "./upload.css";

export function UploadBar() {
  const { rows, note, busy, add } = useUploads();

  return (
    <section className="uploads" aria-label="Add audio">
      <div className="uploads__actions">
        <Picker label="Add files" onPick={add} busy={busy} />
        <Picker label="Add folder" folder onPick={add} busy={busy} />
        {/* The batch's own line: what it is doing, or how it ended. */}
        <p className="uploads__note" role="status">
          {note}
        </p>
      </div>
      {rows.length > 0 && (
        <ul className="uploads__list">
          {rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </ul>
      )}
      <DropTarget onFiles={add} />
    </section>
  );
}

/* The input is the control and the label is its face: one focusable thing with
   one accessible name, rather than a button next to a hidden input that both
   answer to "Add files". */
function Picker({
  label,
  folder = false,
  onPick,
  busy,
}: {
  label: string;
  folder?: boolean;
  onPick: (files: SelectedFile[]) => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `webkitdirectory` is not in React's attribute types; it is set on the node.
  useEffect(() => {
    if (folder && ref.current) ref.current.webkitdirectory = true;
  }, [folder]);

  return (
    <label className={`btn${busy ? " btn--busy" : ""}`}>
      <IconUpload size={15} />
      {label}
      <input
        ref={ref}
        type="file"
        multiple
        disabled={busy}
        className="visually-hidden"
        onChange={(e) => {
          const picked = fromInput(e.target.files);
          // Cleared so choosing the same file twice fires change twice.
          e.target.value = "";
          onPick(picked);
        }}
      />
    </label>
  );
}

const STATE_LABEL: Record<UploadRow["status"], string> = {
  waiting: "Waiting",
  reading: "Reading",
  sending: "Sending",
  finishing: "Finishing",
  done: "Added",
  failed: "Failed",
};

function Row({ row }: { row: UploadRow }) {
  const percent = Math.round(row.progress * 100);
  const state = row.status === "sending" ? `${percent}%` : STATE_LABEL[row.status];

  return (
    <li className={`uprow uprow--${row.status}`}>
      <span className="uprow__name">{row.name}</span>
      <span className="uprow__state mono">{state}</span>
      <div
        className="uprow__bar"
        role="progressbar"
        aria-label={`Upload progress for ${row.name}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="uprow__fill" style={{ width: `${percent}%` }} />
      </div>
      {row.error && <p className="uprow__error">{row.error}</p>}
    </li>
  );
}

/** How long a drag can go quiet before the overlay decides it has ended. */
const DRAG_IDLE_MS = 150;

/* Keyed off dragover, which fires continuously while a drag is over the window.
   An enter/leave counter desyncs and leaves the overlay stuck open; an idle
   timer cannot, and a mouse move — impossible during a drag — clears it too. */
function DropTarget({ onFiles }: { onFiles: (files: SelectedFile[]) => void }) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let idle: number | undefined;
    const carriesFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");

    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setOver(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setOver(false), DRAG_IDLE_MS);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer || !carriesFiles(e)) return;
      e.preventDefault();
      window.clearTimeout(idle);
      setOver(false);
      void fromDataTransfer(e.dataTransfer).then(onFiles);
    };
    const onMouseMove = () => setOver((current) => (current ? false : current));

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [onFiles]);

  if (!over) return null;
  return (
    <div className="dropzone" aria-hidden>
      <div className="dropzone__inner">Drop audio files or a folder to add them</div>
    </div>
  );
}
