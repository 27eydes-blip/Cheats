"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean } | "divider";

/** A small popover menu with keyboard support (arrows, Escape) and outside-click to close. */
export function Menu({ button, items, label, align = "right" }: { button: React.ReactNode; items: MenuItem[]; label: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 min-w-10 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent"
      >
        {button}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          onKeyDown={onMenuKey}
          className={`absolute top-10 z-40 min-w-56 overflow-hidden rounded-xl border border-line bg-bg py-1 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={i} className="my-1 border-t border-line" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-[15px] font-medium hover:bg-surface focus:bg-surface focus:outline-none ${it.danger ? "text-danger" : ""}`}
              >
                {it.icon}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
