"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Split } from "@/lib/stance";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";
import { MiniSplit, StanceChip, type TakeStance } from "../ui/Stance";
import { CloseIcon, DeskIcon, EditionIcon, RundownIcon, SearchIcon, StudioIcon, TakeIcon } from "../icons";
import { useViewer } from "../providers";
import { CHANNELS } from "./channels";
import type { TeamView } from "@/lib/sports/teams";
import { LEAGUE_NAME } from "@/lib/sports/teams-data";
import { TeamLogo } from "../sports/TeamLogo";

type Results = {
  stories: { key: string; title: string; section: string; status: string; takes: number; split: Split }[];
  voices: { handle: string; displayName: string; avatarUrl: string | null; verified: boolean; bio: string }[];
  desks: { slug: string; name: string; description: string }[];
  takes: { id: string; body: string; author: string; stance: TakeStance | null }[];
  teams: TeamView[];
};
type Filter = "all" | "stories" | "voices" | "desks" | "takes";
type Row = { id: string; group: string; node: React.ReactNode; href: string };

/**
 * Full-screen search (⌘K / Ctrl K): results grouped as Stories, Voices,
 * Desks, and Takes, with filters. Empty query shows Hot Stories and quick jumps.
 */
export function SearchOverlay({ open, onClose, onCompose }: { open: boolean; onClose: () => void; onCompose: () => void }) {
  const router = useRouter();
  const viewer = useViewer();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [res, setRes] = useState<Results | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setFilter("all");
      setSel(0);
      d.showModal();
      setTimeout(() => input.current?.focus(), 10);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => fetch(`/api/palette?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then((r) => r.json()).then(setRes).catch(() => {}), 110);
    return () => (clearTimeout(t), ctrl.abort());
  }, [q, open]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const want = (f: Filter) => filter === "all" || filter === f;
    if (!q && filter === "all") {
      const jumps: [string, string, React.ReactNode][] = [
        ["Front Page", "/", <EditionIcon key="e" size={18} />],
        ...(viewer ? ([["Your Rundown", "/rundown", <RundownIcon key="r" size={18} />]] as [string, string, React.ReactNode][]) : []),
        ["Morning Edition", "/briefing", <EditionIcon key="b" size={18} />],
        ["Live Studio", "/live", <StudioIcon key="l" size={18} />],
        ["Desks", "/communities", <DeskIcon key="d" size={18} />],
        ...CHANNELS.slice(1, 7).map((c): [string, string, React.ReactNode] => [`${c.label} channel`, c.href, <EditionIcon key={c.key} size={18} />]),
      ];
      for (const [label, href, icon] of jumps) out.push({ id: `j-${href}`, group: "Jump to", href, node: <span className="flex items-center gap-3"><span className="text-ink-3">{icon}</span>{label}</span> });
    }
    if (res && want("stories"))
      for (const s of res.stories)
        out.push({
          id: `s-${s.key}`, group: q ? "Stories" : "Hot Stories", href: `/news/story/${s.key}`,
          node: (
            <span className="flex w-full items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="folio block !text-[10px] text-ink-3">{s.status === "live" ? <span className="text-live-bg dark:text-live">● Live · </span> : null}{s.section} · {s.takes} dispatches</span>
                <span className="block truncate font-display text-[17px] font-semibold">{s.title}</span>
              </span>
              <MiniSplit split={s.split} />
            </span>
          ),
        });
    if (res && (filter === "all" || filter === "stories"))
      for (const t of res.teams ?? [])
        out.push({
          id: `tm-${t.id}`, group: "Teams", href: `/sports/${t.id}`,
          node: <span className="flex items-center gap-3"><TeamLogo team={t} size="md" label={false} /><span className="min-w-0"><span className="block font-semibold">{t.fullName}</span><span className="block text-[12.5px] text-ink-3">{LEAGUE_NAME[t.league]}</span></span></span>,
        });
    if (res && want("voices"))
      for (const v of res.voices)
        out.push({
          id: `v-${v.handle}`, group: "Voices", href: `/u/${v.handle}`,
          node: (
            <span className="flex min-w-0 items-center gap-3">
              <Avatar url={v.avatarUrl} name={v.displayName} handle={v.handle} size={30} />
              <span className="min-w-0"><span className="flex items-center gap-1 font-semibold">{v.displayName}{v.verified && <VerifiedSeal size={13} />}</span><span className="block truncate text-[12.5px] text-ink-3">{v.bio || `@${v.handle}`}</span></span>
            </span>
          ),
        });
    if (res && want("desks"))
      for (const d of res.desks)
        out.push({ id: `d-${d.slug}`, group: "Desks", href: `/c/${d.slug}`, node: <span className="min-w-0"><span className="block font-semibold">{d.name}</span><span className="block truncate text-[12.5px] text-ink-3">{d.description}</span></span> });
    if (res && want("takes"))
      for (const t of res.takes)
        out.push({ id: `t-${t.id}`, group: "Dispatches", href: `/p/${t.id}`, node: <span className="min-w-0"><span className="flex items-center gap-2 text-[12.5px] text-ink-3">{t.stance && <StanceChip stance={t.stance} />}{t.author}</span><span className="line-clamp-1 block">{t.body}</span></span> });
    if (q.trim() && (filter === "all" || filter === "takes")) out.push({ id: "all", group: "Search", href: `/search?q=${encodeURIComponent(q.trim())}`, node: <span className="flex items-center gap-3"><SearchIcon size={18} className="text-ink-3" />See all results for “{q.trim()}”</span> });
    return out;
  }, [q, res, filter, viewer]);

  useEffect(() => setSel(0), [q, filter]);
  useEffect(() => ref.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" }), [sel]);

  const go = (href: string) => (onClose(), router.push(href));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(rows.length - 1, s + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
    else if (e.key === "Enter") (e.preventDefault(), rows[sel] && go(rows[sel].href));
  };
  const FILTERS: [Filter, string][] = [["all", "All"], ["stories", "Stories"], ["voices", "Voices"], ["desks", "Desks"], ["takes", "Dispatches"]];
  let last = "";

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Search" className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-paper p-0 text-ink-1">
      {open && (
        <div className="mx-auto flex h-full max-w-[860px] flex-col px-4 lg:px-8" onKeyDown={onKey} style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-3 border-b-2 border-navy-ink py-3 lg:pt-10">
            <SearchIcon size={24} className="shrink-0 text-ink-3" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search stories, voices, desks, dispatches"
              className="min-w-0 flex-1 bg-transparent font-display text-[clamp(1.4rem,1.1rem+1.4vw,2.2rem)] font-semibold tracking-[-0.02em] placeholder:font-normal placeholder:text-ink-3 focus:outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls="search-list"
              aria-activedescendant={rows[sel] ? `sr-${rows[sel].id}` : undefined}
              enterKeyHint="search"
            />
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-2 hover:bg-paper-2" aria-label="Close search"><CloseIcon size={22} /></button>
          </div>
          <div className="scrollbar-none flex gap-2 overflow-x-auto py-3" role="radiogroup" aria-label="Filter results">
            {FILTERS.map(([f, l]) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={`inline-flex min-h-9 shrink-0 items-center rounded-[10px] px-3 text-[13px] font-semibold ${filter === f ? "bg-navy text-white shadow-[inset_0_-2px_0_var(--gold)]" : "text-ink-2 ring-1 ring-rule hover:ring-rule-strong"}`}>{l}</button>
            ))}
            {viewer && (
              <button type="button" onClick={() => (onClose(), onCompose())} className="btn-gold ml-auto !min-h-9 !px-3 !text-[13px]"><TakeIcon size={15} /> Dispatch</button>
            )}
          </div>
          <ul id="search-list" role="listbox" className="flex-1 overflow-y-auto overscroll-contain pb-10">
            {rows.length === 0 && res && <li className="py-16 text-center font-display text-h3 text-ink-3">Nothing on the wire for “{q}”.</li>}
            {rows.map((r, i) => {
              const header = r.group !== last ? r.group : null;
              last = r.group;
              return (
                <li key={r.id} role="presentation">
                  {header && <p className="folio border-b border-rule pt-5 pb-1.5 text-ink-3">{header}</p>}
                  <button
                    type="button"
                    id={`sr-${r.id}`}
                    role="option"
                    aria-selected={i === sel}
                    data-idx={i}
                    onMouseMove={() => setSel(i)}
                    onClick={() => go(r.href)}
                    className={`flex min-h-12 w-full items-center border-b border-rule px-2 py-2 text-left text-[15px] transition-colors ${i === sel ? "bg-gold-soft shadow-[inset_3px_0_0_var(--gold)]" : ""}`}
                  >
                    {r.node}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}
