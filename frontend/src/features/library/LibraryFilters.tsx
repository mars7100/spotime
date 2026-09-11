/* The narrowing toolbar: a search box, the kind tabs, and the tag filter.
   The tag filter is a typeahead rather than a wall of chips because a wall
   stops working somewhere around fifty tags: what is *applied* shows as
   dismissable chips, and everything else is found by typing. */
import { useId, useRef, useState } from "react";
import { IconClose, IconSearch } from "../../ui/icons";
import type { Filters, Kind } from "./filters";
import "./filters.css";

/** Beyond this the list stops being a list you read and starts being a wall. */
const MAX_SUGGESTIONS = 50;

const TABS: { kind: Kind; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "music", label: "Music" },
  { kind: "audiobook", label: "Audiobooks" },
];

export interface LibraryFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  /** Tags on the records currently in view, with their counts. */
  suggestions: { tag: string; count: number }[];
  /** False when the whole library carries no tags — the control is not shown. */
  showTags: boolean;
  /** Ties the kind tabs to the list they narrow. */
  panelId: string;
}

export function LibraryFilters({
  filters,
  onChange,
  suggestions,
  showTags,
  panelId,
}: LibraryFiltersProps) {
  return (
    <div className="filters">
      <div className="filters__row">
        <SearchBox value={filters.search} onChange={(search) => onChange({ ...filters, search })} />
        <Tabs
          kind={filters.kind}
          onChange={(kind) => onChange({ ...filters, kind })}
          panelId={panelId}
        />
      </div>
      {showTags && (
        <TagFilter
          selected={filters.tags}
          suggestions={suggestions}
          onChange={(tags) => onChange({ ...filters, tags })}
        />
      )}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="searchbox">
      <IconSearch className="searchbox__icon" />
      <input
        type="search"
        className="searchbox__input"
        aria-label="Search library"
        placeholder="Search title, artist, album"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Tabs({
  kind,
  onChange,
  panelId,
}: {
  kind: Kind;
  onChange: (k: Kind) => void;
  panelId: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Kind">
      {TABS.map((tab) => (
        <button
          key={tab.kind}
          type="button"
          role="tab"
          id={`tab-${tab.kind}`}
          aria-selected={kind === tab.kind}
          aria-controls={panelId}
          className={`tab${kind === tab.kind ? " tab--on" : ""}`}
          onClick={() => onChange(tab.kind)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TagFilter({
  selected,
  suggestions,
  onChange,
}: {
  selected: string[];
  suggestions: { tag: string; count: number }[];
  onChange: (tags: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const needle = query.trim().toLowerCase();
  const matches = suggestions
    .filter((s) => !selected.includes(s.tag) && (needle === "" || s.tag.toLowerCase().includes(needle)))
    .slice(0, MAX_SUGGESTIONS);

  const add = (tag: string) => {
    onChange([...selected, tag]);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className="tagfilter">
      {selected.map((tag) => (
        <button
          key={tag}
          type="button"
          className="chip"
          aria-label={`Remove filter ${tag}`}
          onClick={() => onChange(selected.filter((t) => t !== tag))}
        >
          {tag}
          <IconClose size={12} className="chip__x" />
        </button>
      ))}
      <div className="typeahead">
        <input
          ref={inputRef}
          type="text"
          className="typeahead__input"
          role="combobox"
          aria-label="Filter by tag"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Filter by tag"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          /* A click on a suggestion blurs the input first; closing the list
             here and now would delete the thing being clicked. The suggestions
             commit on mousedown, which fires before the blur, so this only has
             to run after that has had its chance. */
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches.length > 0) {
              e.preventDefault();
              add(matches[0].tag);
            } else if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
            }
          }}
        />
        {/* Options are the listbox's own children — an <li> between the two
            would break the ownership the role depends on. */}
        {open && matches.length > 0 && (
          <div className="typeahead__list" id={listId} role="listbox" aria-label="Matching tags">
            {matches.map((s) => (
              <button
                key={s.tag}
                type="button"
                role="option"
                aria-selected={false}
                /* Without this the name reads "night2" — the count sits in its
                   own element and nothing puts a space between them. */
                aria-label={`${s.tag}, ${s.count} ${s.count === 1 ? "track" : "tracks"}`}
                className="typeahead__option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s.tag);
                }}
              >
                <span>{s.tag}</span>
                <span className="mono typeahead__count">{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
