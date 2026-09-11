/* The library list.
   Music rows are the redesign: index, art, title over artist and album, tags in
   their own column, and a duration that lines up down the page. Audiobooks are
   ported, not redesigned — they keep the vanilla client's treatment (a progress
   bar and a resume line) restyled onto the new tokens. */
import { useEffect, useMemo, useState } from "react";
import { bulkDelete, deleteMedia, setTags } from "../../api/client";
import { CoverArt } from "../../ui/CoverArt";
import { IconCheck } from "../../ui/icons";
import { formatDuration, formatTime } from "../../lib/format";
import type { AudiobookRecord, MediaRecord, MusicRecord } from "../../api/types";
import { useNowPlaying, usePlayerCommands } from "../../player/PlayerProvider";
import { BulkBar } from "./BulkBar";
import { toCards, type Card } from "./cards";
import { applyFilters, hasAnyTag, isNarrowed, NO_FILTERS, tagCounts, type Filters } from "./filters";
import { LibraryFilters } from "./LibraryFilters";
import { notifyLibraryChanged } from "./refresh";
import { toast } from "../../ui/toast";
import { RowMenu } from "./RowMenu";
import { useLibrary } from "./useLibrary";
import "./library.css";

/** How many of the newest cards get their own section. */
const RECENT_COUNT = 5;

const NOTHING: MediaRecord[] = [];

/** Ties the kind tabs to the list they narrow. */
const PANEL_ID = "library-panel";

/** Select mode, as the rows see it. Absent when not selecting. */
interface Sel {
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function Library() {
  const result = useLibrary();
  const { setQueueSource } = usePlayerCommands();
  const all = result.status === "ready" ? result.items : NOTHING;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // One value for "am I selecting" and "what is selected": null is not
  // selecting, a Set (possibly empty) is. The two can never disagree.
  const [selection, setSelection] = useState<Set<string> | null>(null);

  // A deleted track cannot stay selected.
  useEffect(() => {
    setSelection((s) => {
      if (!s) return s;
      const kept = new Set([...s].filter((id) => all.some((i) => i.id === id)));
      return kept.size === s.size ? s : kept;
    });
  }, [all]);

  const sel: Sel | null = selection && {
    has: (id) => selection.has(id),
    toggle: (id) =>
      setSelection((s) => {
        const next = new Set(s);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
  };

  // Search, tabs and tags narrow in one pass, so they compose rather than
  // fight. Memoised because the queue is fed from this list by identity.
  const items = useMemo(() => applyFilters(all, filters), [all, filters]);

  // The queue is the music currently in view, in library order. Handing the
  // list over here keeps the player ignorant of how the library was narrowed.
  useEffect(() => setQueueSource(items), [items, setQueueSource]);

  // Counted over what is in view, not the whole library, so applying any
  // suggestion always leaves something behind.
  const suggestions = useMemo(() => tagCounts(items), [items]);

  if (result.status === "loading") {
    return <p className="library__note">Loading your library…</p>;
  }
  if (result.status === "error") {
    return <p className="library__note library__note--error">Couldn’t load your library: {result.message}</p>;
  }
  if (all.length === 0) {
    return (
      <div className="empty">
        <h2 className="empty__title">Nothing here yet</h2>
        <p className="empty__body">
          Upload audio files or a folder to start your library, or paste a video or playlist link to
          pull the audio down.
        </p>
      </div>
    );
  }

  return (
    <>
      <LibraryFilters
        filters={filters}
        onChange={setFilters}
        suggestions={suggestions}
        showTags={hasAnyTag(all)}
        panelId={PANEL_ID}
        selecting={selection != null}
        onToggleSelect={
          all.some((i) => i.media_type === "music")
            ? () => setSelection((s) => (s ? null : new Set()))
            : undefined
        }
      />
      {/* Drawn from the whole library, not the filtered view, so narrowing
          the list after picking does not silently drop picks. */}
      {selection && selection.size > 0 && (
        <BulkBar
          selected={all.filter((i) => selection.has(i.id)).map(({ id, title }) => ({ id, title }))}
          onClear={() => setSelection(new Set())}
        />
      )}
      <div
        className="library"
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`tab-${filters.kind}`}
        tabIndex={-1}
      >
        <Sections cards={toCards(items)} narrowed={isNarrowed(filters)} sel={sel} />
      </div>
    </>
  );
}

function Sections({ cards, narrowed, sel }: { cards: Card[]; narrowed: boolean; sel: Sel | null }) {
  // An empty library and a library you have filtered down to nothing are
  // different problems: one wants an upload prompt, the other wants to know
  // the filters did this.
  if (cards.length === 0) {
    return <p className="library__note">No tracks match these filters.</p>;
  }

  // "Recently added" is a claim about the whole library, so it is only honest
  // when nothing is narrowing it.
  if (narrowed) return <Section title="Results" cards={cards} startIndex={1} sel={sel} />;

  // The API returns newest first, so the head of the list is what arrived last.
  const recent = cards.slice(0, RECENT_COUNT);
  const rest = cards.slice(RECENT_COUNT);
  return (
    <>
      <Section title="Recently added" cards={recent} startIndex={1} sel={sel} />
      {rest.length > 0 && (
        <Section title="Library" cards={rest} startIndex={recent.length + 1} sel={sel} />
      )}
    </>
  );
}

function Section({
  title,
  cards,
  startIndex,
  sel,
}: {
  title: string;
  cards: Card[];
  startIndex: number;
  sel: Sel | null;
}) {
  return (
    <section>
      <h2 className="section-head">
        {title} <span className="mono">{cards.length}</span>
      </h2>
      <ul className={`list${sel ? " list--selecting" : ""}`}>
        {cards.map((card, i) => (
          <Row key={card.id} card={card} index={startIndex + i} sel={sel} />
        ))}
      </ul>
    </section>
  );
}

function Row({ card, index, sel }: { card: Card; index: number; sel: Sel | null }) {
  if (card.kind === "book") return <BookRow card={card} index={index} inert={sel != null} />;
  return card.item.media_type === "music" ? (
    <TrackRow item={card.item} index={index} sel={sel} />
  ) : (
    <AudiobookRow item={card.item} index={index} inert={sel != null} />
  );
}

const subtitleOf = (item: MediaRecord) =>
  [item.artist, item.album].filter(Boolean).join(" — ") || "Unknown";

/* The browser's own prompt and confirm, as in the vanilla client — replacing
   them is out of scope for the port; outcomes go to the toast. The server
   normalises tags (lowercase, trim, dedupe), so the input is only split here;
   the reload shows the result. */
function editTags(item: MusicRecord) {
  const input = window.prompt("Tags (comma-separated):", item.tags.join(", "));
  if (input === null) return;
  const tags = input.split(",").map((t) => t.trim()).filter(Boolean);
  setTags(item.id, tags)
    .then(() => {
      toast("Tags saved");
      notifyLibraryChanged();
    })
    .catch(() => toast("Could not save tags"));
}

function confirmDelete(title: string, remove: () => Promise<unknown>) {
  if (!window.confirm(`Delete "${title}"?`)) return;
  remove()
    .then(() => {
      toast("Deleted");
      notifyLibraryChanged();
    })
    .catch(() => toast("Could not delete"));
}

/** The whole row is the target — the button is stretched over it rather than
    wrapping it, so the overflow menu sits inside the row without nesting a
    button inside a button. */
function PlayHit({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <button type="button" className="row__hit" aria-label={`Play ${label}`} onClick={onPlay} />
  );
}

/** The index becomes the playing indicator for the active track, or a check
    for a selected one. */
function RowIndex({
  index,
  active,
  playing,
  selected = false,
}: {
  index: number;
  active: boolean;
  playing: boolean;
  selected?: boolean;
}) {
  if (selected) {
    return (
      <div className="row-num row-num--check">
        <IconCheck size={16} />
      </div>
    );
  }
  if (!active) return <div className="row-num mono">{index}</div>;
  return (
    <div className={`row-num playing-mark${playing ? " playing-mark--on" : ""}`} aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}

function TrackRow({ item, index, sel }: { item: MusicRecord; index: number; sel: Sel | null }) {
  const { play } = usePlayerCommands();
  const now = useNowPlaying();
  const active = now.id === item.id;
  const selected = sel?.has(item.id) ?? false;

  return (
    <li className={`row${active ? " row--playing" : ""}${selected ? " row--selected" : ""}`}>
      {/* In select mode the stretched hit is the checkbox, so clicking the row
          picks it instead of playing it. */}
      {sel ? (
        <input
          type="checkbox"
          className="row__hit row__check"
          aria-label={`Select ${item.title}`}
          checked={selected}
          onChange={() => sel.toggle(item.id)}
        />
      ) : (
        <PlayHit label={item.title} onPlay={() => play(item)} />
      )}
      <RowIndex index={index} active={active} playing={now.playing} selected={selected} />
      <CoverArt mediaId={item.artwork_path ? item.id : null} kind="music" />
      <div className="row-body">
        <div className="row-title">{item.title}</div>
        <div className="row-sub">{subtitleOf(item)}</div>
      </div>
      <div className="pills">
        {item.tags.map((tag) => (
          <span className="pill" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="dur mono">{formatDuration(item.duration_seconds)}</div>
      {sel ? (
        <div />
      ) : (
        <RowMenu
          label={item.title}
          onEditTags={() => editTags(item)}
          onDelete={() => confirmDelete(item.title, () => deleteMedia(item.id))}
        />
      )}
    </li>
  );
}

/** A single-file audiobook: one record, its own saved position. */
/** `inert`: select mode is on, and books cannot be tagged, so this one dims out. */
function AudiobookRow({ item, index, inert }: { item: AudiobookRecord; index: number; inert: boolean }) {
  const { play } = usePlayerCommands();
  const now = useNowPlaying();
  const active = now.id === item.id;
  const state = item.state;
  const percent =
    state && item.duration_seconds
      ? Math.min(100, (state.position_seconds / item.duration_seconds) * 100)
      : 0;
  const resumable = state != null && state.position_seconds > 5;

  return (
    <li className={`row row--book${active ? " row--playing" : ""}${inert ? " row--inert" : ""}`}>
      {!inert && <PlayHit label={item.title} onPlay={() => play(item)} />}
      <RowIndex index={index} active={active} playing={now.playing} />
      <CoverArt mediaId={item.artwork_path ? item.id : null} kind="audiobook" />
      <div className="row-body">
        <div className="row-title">
          {item.title}
          <span className="badge">audiobook</span>
        </div>
        <div className="row-sub">{subtitleOf(item)}</div>
        {state?.completed ? (
          <div className="resume">Finished</div>
        ) : (
          resumable && (
            <>
              <Progress percent={percent} />
              <div className="resume">
                Resume {formatTime(state.position_seconds)} · {Math.round(percent)}%
              </div>
            </>
          )
        )}
      </div>
      <div className="pills" />
      <div className="dur mono">{formatDuration(item.duration_seconds)}</div>
      {inert ? (
        <div />
      ) : (
        <RowMenu
          label={item.title}
          onDelete={() => confirmDelete(item.title, () => deleteMedia(item.id))}
        />
      )}
    </li>
  );
}

/** A book uploaded as a folder: many chapter records, shown as one thing. */
function BookRow({
  card,
  index,
  inert,
}: {
  card: Extract<Card, { kind: "book" }>;
  index: number;
  inert: boolean;
}) {
  const { playBook } = usePlayerCommands();
  const now = useNowPlaying();
  const active = card.tracks.some((t) => t.id === now.id);
  const { progress } = card;
  const total = card.tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);

  return (
    <li className={`row row--book${active ? " row--playing" : ""}${inert ? " row--inert" : ""}`}>
      {/* The book opens where you left it — its first unfinished chapter — and
          runs on from there, chapter to chapter. */}
      {!inert && (
        <PlayHit label={card.title} onPlay={() => playBook(card, progress.resumeIndex)} />
      )}
      <RowIndex index={index} active={active} playing={now.playing} />
      <CoverArt mediaId={card.artworkId} kind="audiobook" />
      <div className="row-body">
        <div className="row-title">
          {card.title}
          <span className="badge">audiobook</span>
        </div>
        <div className="row-sub">
          {card.artist ? `${card.artist} — ` : ""}
          {progress.total} chapters
        </div>
        {progress.finished ? (
          <div className="resume">Finished</div>
        ) : (
          progress.started && (
            <>
              <Progress percent={progress.percent} />
              <div className="resume">
                {progress.done} of {progress.total} chapters · {Math.round(progress.percent)}%
              </div>
            </>
          )
        )}
      </div>
      <div className="pills" />
      <div className="dur mono">{formatDuration(total || null)}</div>
      {inert ? (
        <div />
      ) : (
        <RowMenu
          label={card.title}
          onDelete={() =>
            confirmDelete(card.title, () => bulkDelete(card.tracks.map((t) => t.id)))
          }
        />
      )}
    </li>
  );
}

function Progress({ percent }: { percent: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
