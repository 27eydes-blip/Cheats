"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { usePhone } from "./useMedia";

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; hint?: string } | "divider";

/**
 * Overflow menu: a popover on desktop (arrow keys, Escape, outside click),
 * a bottom sheet with big tap targets on phones.
 */
export function Menu({ button, items, label, align = "right", buttonClassName }: { button: React.ReactNode; items: MenuItem[]; label: string; align?: "left" | "right"; buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open || phone) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phone]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
  }

  const itemEls = (big: boolean) =>
    items.map((it, i) =>
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
          className={`flex w-full items-center gap-3 text-left font-medium transition-colors hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${big ? "min-h-14 px-5 text-[16px]" : "min-h-10 rounded-[10px] px-3 text-[14.5px]"} ${it.danger ? "text-danger" : "text-ink-1"}`}
        >
          <span className={it.danger ? "" : "text-ink-2"}>{it.icon}</span>
          <span className="flex-1">{it.label}</span>
          {it.hint && <kbd className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-3">{it.hint}</kbd>}
        </button>
      ),
    );

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName ?? "flex h-9 min-w-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-accent-soft hover:text-accent"}
      >
        {button}
      </button>
      {phone ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={label} hideTitle>
          <div role="menu" id={id} className="pt-1 pb-3">{itemEls(true)}</div>
        </Sheet>
      ) : (
        open && (
          <div
            id={id}
            role="menu"
            onKeyDown={onMenuKey}
            className={`absolute top-10 z-40 min-w-60 origin-top animate-scale-in rounded-[var(--r-md)] border border-line bg-surface p-1.5 shadow-3 ${align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}
          >
            {itemEls(false)}
          </div>
        )
      )}
    </div>
  );
}
