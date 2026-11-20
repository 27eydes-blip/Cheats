"use client";

import { SearchIcon } from "@/components/icons";
import { usePalette } from "@/components/providers";

/** A big search field that opens the full search overlay (stories, teams, people, groups, dispatches). */
export function DiscoverSearch() {
  const open = usePalette();
  return (
    <button type="button" onClick={open} className="flex min-h-12 w-full items-center gap-3 rounded-[14px] bg-[var(--wn-panel-1)] px-4 text-left text-[15px] text-ink-3 ring-1 ring-[var(--wn-glass-border)] transition-all hover:ring-[var(--wn-cyan)] active:scale-[0.99]">
      <SearchIcon size={19} className="text-[var(--wn-cyan-ink)]" /> Search stories, teams, people and dispatches
    </button>
  );
}
