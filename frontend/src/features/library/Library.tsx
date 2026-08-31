/* The library list.
   Music rows are the redesign: index, art, title over artist and album, tags in
   their own column, and a duration that lines up down the page. Audiobooks are
   ported, not redesigned — they keep the vanilla client's treatment (a progress
   bar and a resume line) restyled onto the new tokens. */
import { useEffect } from "react";
import { CoverArt } from "../../ui/CoverArt";
import { formatDuration, formatTime } from "../../lib/format";
import type { AudiobookRecord, MediaRecord, MusicRecord } from "../../api/types";
import { useNowPlaying, usePlayerCommands } from "../../player/PlayerProvider";
import { toCards, type Card } from "./cards";
import { useLibrary } from "./useLibrary";
import "./library.css";

/** How many of the newest cards get their own section. */
const RECENT_COUNT = 5;

const NOTHING: MediaRecord[] = [];

export function Library() {
  const result = useLibrary();
  const { setQueueSource } = usePlayerCommands();
  const items = result.status === "ready" ? result.items : NOTHING;

  // The queue is the music currently in view, in library order. Handing the
  // list over here keeps the player ignorant of how the library was narrowed.
  useEffect(() => setQueueSource(items), [items, setQueueSource]);

  if (result.status === "loading") {
    return <p className="library__note">Loading your library…</p>;
  }
  if (result.status === "error") {
    return <p className="library__note library__note--error">Couldn’t load your library: {result.message}</p>;
  }
  if (items.length === 0) {
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

  // The API returns newest first, so the head of the list is what arrived last.
  const cards = toCards(items);
  const recent = cards.slice(0, RECENT_COUNT);
  const rest = cards.slice(RECENT_COUNT);

  return (
    <div className="library">
      <Section title="Recently added" cards={recent} startIndex={1} />
      {rest.length > 0 && <Section title="Library" cards={rest} startIndex={recent.length + 1} />}
    </div>
  );
}

function Section({ title, cards, startIndex }: { title: string; cards: Card[]; startIndex: number }) {
  return (
    <section>
      <h2 className="section-head">
        {title} <span className="mono">{cards.length}</span>
      </h2>
      <ul className="list">
        {cards.map((card, i) => (
          <Row key={card.id} card={card} index={startIndex + i} />
        ))}
      </ul>
    </section>
  );
}

function Row({ card, index }: { card: Card; index: number }) {
  if (card.kind === "book") return <BookRow card={card} index={index} />;
  return card.item.media_type === "music" ? (
    <TrackRow item={card.item} index={index} />
  ) : (
    <AudiobookRow item={card.item} index={index} />
  );
}

const subtitleOf = (item: MediaRecord) =>
  [item.artist, item.album].filter(Boolean).join(" — ") || "Unknown";

/** The whole row is the target — the button is stretched over it rather than
    wrapping it, so ticket 11's overflow menu can sit inside the row without
    nesting a button inside a button. */
function PlayHit({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <button type="button" className="row__hit" aria-label={`Play ${label}`} onClick={onPlay} />
  );
}

/** The index becomes the playing indicator for the active track. */
function RowIndex({ index, active, playing }: { index: number; active: boolean; playing: boolean }) {
  if (!active) return <div className="row-num mono">{index}</div>;
  return (
    <div className={`row-num playing-mark${playing ? " playing-mark--on" : ""}`} aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}

function TrackRow({ item, index }: { item: MusicRecord; index: number }) {
  const { play } = usePlayerCommands();
  const now = useNowPlaying();
  const active = now.id === item.id;

  return (
    <li className={`row${active ? " row--playing" : ""}`}>
      <PlayHit label={item.title} onPlay={() => play(item)} />
      <RowIndex index={index} active={active} playing={now.playing} />
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
      <div className="row-menu-slot" />
    </li>
  );
}

/** A single-file audiobook: one record, its own saved position. */
function AudiobookRow({ item, index }: { item: AudiobookRecord; index: number }) {
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
    <li className={`row row--book${active ? " row--playing" : ""}`}>
      <PlayHit label={item.title} onPlay={() => play(item)} />
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
      <div className="row-menu-slot" />
    </li>
  );
}

/** A book uploaded as a folder: many chapter records, shown as one thing. */
function BookRow({
  card,
  index,
}: {
  card: Extract<Card, { kind: "book" }>;
  index: number;
}) {
  const { playBook } = usePlayerCommands();
  const now = useNowPlaying();
  const active = card.tracks.some((t) => t.id === now.id);
  const { progress } = card;
  const total = card.tracks.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);

  return (
    <li className={`row row--book${active ? " row--playing" : ""}`}>
      {/* The book opens where you left it — its first unfinished chapter — and
          runs on from there, chapter to chapter. */}
      <PlayHit label={card.title} onPlay={() => playBook(card, progress.resumeIndex)} />
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
      <div className="row-menu-slot" />
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
