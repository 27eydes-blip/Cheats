"use client";

import { SearchIcon } from "../icons";
import { usePalette } from "../providers";

/** Looks like a search field, opens the command palette (with live results). */
export function RailSearch() {
  const open = usePalette();
  return (
    <button
      type="button"
      onClick={open}
      className="glass sticky top-0 z-10 flex h-12 w-full shrink-0 items-center gap-3 rounded-full px-4 text-left text-[14.5px] text-ink-3 ring-1 ring-line transition-shadow hover:ring-line-strong focus-visible:shadow-glow"
    >
      <SearchIcon size={18} />
      <span className="flex-1">Search Townsquare</span>
      <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold">⌘K</kbd>
    </button>
  );
}
