/* The chapter list.
   A panel over the player rather than a page of its own: picking a chapter is
   something you do *while* listening, and the transport stays where it was.

   It renders whatever the provider hands it, so it does not know — and must not
   care — whether picking a chapter is a seek inside one file or a load of the
   next one. */
import { useState } from "react";
import { formatTime } from "../../lib/format";
import { IconChapters } from "../../ui/icons";
import { useChapters } from "../../player/PlayerProvider";

export function Chapters() {
  const { entries, currentIndex, select } = useChapters();
  const [open, setOpen] = useState(false);

  // Music has none, and neither does a book whose file carries no marks — there
  // is nothing to show, so there is no button to press.
  if (entries.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className={`ctl${open ? " ctl--on" : ""}`}
        aria-label="Chapters"
        aria-expanded={open}
        aria-controls="chapters-panel"
        onClick={() => setOpen((was) => !was)}
      >
        <IconChapters />
      </button>

      {open && (
        <div className="chapters" id="chapters-panel">
          <h2 className="chapters__head">Chapters</h2>
          <ol className="chapters__list" aria-label="Chapters">
            {entries.map((entry, i) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`chapter${i === currentIndex ? " chapter--current" : ""}`}
                  aria-current={i === currentIndex ? "true" : undefined}
                  onClick={() => select(i)}
                >
                  <span className="chapter__title">{entry.title}</span>
                  <span className="mono chapter__time">
                    {entry.startSeconds == null ? "—" : formatTime(entry.startSeconds)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
