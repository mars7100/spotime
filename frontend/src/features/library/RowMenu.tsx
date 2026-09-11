/* The per-row overflow menu. Open state is local to each menu; "only one open
   at a time" and "clicking elsewhere closes it" are the same rule — any
   pointerdown outside this menu closes it, including one on another row's
   trigger. */
import { useEffect, useRef, useState } from "react";
import { IconMore } from "../../ui/icons";

export function RowMenu({
  label,
  onEditTags,
  onDelete,
}: {
  label: string;
  onEditTags?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="row-menu" ref={root}>
      <button
        type="button"
        className="row-menu__btn"
        ref={trigger}
        aria-label={`More for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconMore />
      </button>
      {open && (
        <div role="menu" className="menu">
          {onEditTags && (
            <button type="button" role="menuitem" className="menu__item" onClick={pick(onEditTags)}>
              Edit tags
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu__item menu__item--danger"
            onClick={pick(onDelete)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
