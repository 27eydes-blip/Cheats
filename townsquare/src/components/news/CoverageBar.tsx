"use client";

import { useState } from "react";
import type { CoverageItem } from "@/lib/news";
import type { Coverage } from "@/lib/newsroom/coverage";
import { Sheet } from "../ui/Sheet";
import { CoverageList } from "./CoverageList";

/** Muted segment colors, labeled in text too (color is never the only cue). */
export const SIDE_COLOR = { left: "#5b8def", center: "#9aa3b5", right: "#c96a72" } as const;
const pct = (x: number) => Math.round(x * 100);

/**
 * The slim coverage bar: share of left / center / right outlets covering a
 * story, with the outlet count and a neutral flag when coverage is lopsided.
 * Tapping it opens the outlets grouped by lean.
 */
export function CoverageBar({ storyKey, coverage, items, size = "sm" }: { storyKey: string; coverage: Coverage; items?: CoverageItem[]; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<CoverageItem[] | null>(items ?? null);
  const [error, setError] = useState(false);
  if (!coverage.total) return null;
  const c = coverage;
  // Starts with the visible text (so voice control users can say it), then spells it out.
  const visible = `${c.rated ? `L ${pct(c.shares.left)} · C ${pct(c.shares.center)} · R ${pct(c.shares.right)} · ` : ""}${c.total} outlet${c.total === 1 ? "" : "s"}`;
  const label = `${visible}${c.rated ? `: ${pct(c.shares.left)}% left, ${pct(c.shares.center)}% center, ${pct(c.shares.right)}% right` : ""}${c.flag ? `. ${c.flag.text}` : ""}. Show the outlets`;
  const show = () => {
    setOpen(true);
    if (!list) fetch(`/api/stories/${encodeURIComponent(storyKey)}/coverage`).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: { items: CoverageItem[] }) => setList(d.items)).catch(() => setError(true));
  };
  return (
    <>
      <button type="button" onClick={(e) => (e.preventDefault(), e.stopPropagation(), show())} aria-label={label} aria-haspopup="dialog" className={`tap group flex w-full max-w-[360px] items-center gap-2 text-left text-ink-3 ${size === "md" ? "text-[13px]" : "text-[12px]"}`}>
        {c.rated > 0 ? (
          <span aria-hidden="true" className={`flex flex-1 overflow-hidden rounded-full bg-white/[0.06] ${size === "md" ? "h-[6px]" : "h-[4px]"}`}>
            {(["left", "center", "right"] as const).map((s) => (c.shares[s] > 0 ? <span key={s} style={{ width: `${c.shares[s] * 100}%`, background: SIDE_COLOR[s] }} className="h-full" /> : null))}
          </span>
        ) : (
          <span aria-hidden="true" className="flex-1 text-[11.5px]">Not rated</span>
        )}
        <span aria-hidden="true" className="shrink-0 tabular-nums group-hover:text-ink-1">
          {c.rated > 0 && <><span>L {pct(c.shares.left)}</span> · <span>C {pct(c.shares.center)}</span> · <span>R {pct(c.shares.right)}</span> · </>}
          {c.total} outlet{c.total === 1 ? "" : "s"}
        </span>
      </button>
      {c.flag && <p className={`mt-0.5 text-ink-3 ${size === "md" ? "text-[13px]" : "text-[12px]"}`}>{c.flag.text}</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Who's covering this">
        <div className="px-4 pb-6">
          {list ? <CoverageList items={list} /> : error ? <p className="py-6 text-center text-[14px] text-ink-3">Couldn&apos;t load the outlets. Try again.</p> : <p role="status" className="py-6 text-center text-[14px] text-ink-3">Loading outlets…</p>}
        </div>
      </Sheet>
    </>
  );
}
