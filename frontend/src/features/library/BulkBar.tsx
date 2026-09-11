/* Acts on the current selection. Tag add/remove keep the selection so a bad
   bulk tag can be undone without re-ticking; delete clears it, since the rows
   are gone. Native confirm/alert, as elsewhere in the port. */
import { useState } from "react";
import { bulkDelete, bulkTags } from "../../api/client";
import { notifyLibraryChanged } from "./refresh";
import "./bulk.css";

const parseTags = (input: string) =>
  input.split(",").map((t) => t.trim()).filter(Boolean);

export function BulkBar({
  selected,
  onClear,
}: {
  selected: { id: string; title: string }[];
  onClear: () => void;
}) {
  const [input, setInput] = useState("");
  const ids = selected.map((s) => s.id);
  const tags = parseTags(input);

  const tag = (change: { add?: string[]; remove?: string[] }) =>
    bulkTags(ids, change)
      .then(() => {
        setInput("");
        notifyLibraryChanged();
      })
      .catch(() => window.alert("Bulk tagging failed"));

  const remove = () => {
    const n = selected.length;
    const preview = selected.slice(0, 5).map((s) => s.title).join("\n");
    const more = n > 5 ? `\n…and ${n - 5} more` : "";
    if (!window.confirm(`Delete ${n} track(s)? This cannot be undone.\n\n${preview}${more}`)) return;
    bulkDelete(ids)
      .then(() => {
        onClear();
        notifyLibraryChanged();
      })
      .catch(() => window.alert("Bulk delete failed"));
  };

  return (
    <div className="bulk" role="region" aria-label="Bulk actions">
      <span className="bulk__count mono">{selected.length} selected</span>
      <input
        type="text"
        className="bulk__input"
        aria-label="Tags"
        placeholder="tags, comma-separated"
        autoComplete="off"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && tags.length) void tag({ add: tags });
        }}
      />
      <button type="button" className="bulk__btn" disabled={!tags.length} onClick={() => tag({ add: tags })}>
        Add
      </button>
      <button type="button" className="bulk__btn" disabled={!tags.length} onClick={() => tag({ remove: tags })}>
        Remove
      </button>
      <button type="button" className="bulk__btn bulk__btn--danger" onClick={remove}>
        Delete
      </button>
      <button type="button" className="bulk__btn" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
