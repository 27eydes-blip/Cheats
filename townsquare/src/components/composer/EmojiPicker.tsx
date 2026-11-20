"use client";

import { useEffect, useRef, useState } from "react";

const SETS: [string, string[]][] = [
  ["News", ["📰", "🗳️", "📈", "📉", "🏛️", "⚖️", "🌎", "🔥", "⚡", "🚨", "🧾", "🔗"]],
  ["Feels", ["😀", "😂", "🤯", "🤔", "😬", "😮", "😢", "😡", "🙌", "👏", "🫡", "🤦"]],
  ["Sports", ["🏈", "🏀", "⚾", "🏒", "⚽", "🏆", "🥇", "🎯", "💪", "🏁", "📣", "🎉"]],
  ["Things", ["💯", "✅", "❌", "👀", "💡", "🧠", "💬", "📊", "💰", "🛰️", "🌪️", "☕"]],
];

/** Small emoji palette that inserts at the cursor. */
export function EmojiPicker({ onPick, disabled }: { onPick: (e: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", close), document.removeEventListener("keydown", esc));
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Add emoji" aria-expanded={open} title="Emoji" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[19px] hover:bg-navy-soft disabled:opacity-40">😊</button>
      {open && (
        <div role="dialog" aria-label="Emoji" className="glass-strong absolute bottom-full left-0 z-40 mb-2 w-[296px] animate-scale-in rounded-[16px] p-2 shadow-3 ring-1 ring-[var(--wn-glass-border)]">
          {SETS.map(([name, list]) => (
            <div key={name} className="mb-1">
              <p className="px-1 pt-1 text-[10px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">{name}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {list.map((e) => (
                  <button key={e} type="button" onClick={() => onPick(e)} className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[20px] transition-transform hover:scale-125 hover:bg-white/5" aria-label={e}>{e}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
