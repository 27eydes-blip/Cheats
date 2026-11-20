"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { feedTabAction } from "@/actions/menu";
import type { FeedTab } from "@/lib/feedtabs";
import { MAX_FEED_TABS, tabHref, tabParam, TOPIC_LABEL, type HomeTab } from "@/lib/feedtabs-meta";
import type { TeamView } from "@/lib/sports/teams";
import { CloseIcon, PlusIcon, SearchIcon, SparkIcon, UserIcon } from "../icons";
import { useToast, useViewer } from "../providers";
import { TeamLogo } from "../sports/TeamLogo";
import { Sheet } from "../ui/Sheet";


/** Small badge for a topic: a colored tile with its initial. Teams use their logo badge. */
function TopicBadge({ topic }: { topic: string }) {
  return <span aria-hidden="true" className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] font-display text-[13px] leading-none font-extrabold text-[#070b14]" style={{ background: "#7fa3ff" }}>{TOPIC_LABEL[topic]?.[0]}</span>;
}

/**
 * The home tab strip: For You, Friends, then your pinned topics and teams,
 * and a + button to add more. Scrolls sideways; swiping left/right on the
 * feed moves to the next/previous tab.
 */
export function FeedTabs({ tabs, active }: { tabs: FeedTab[]; active: HomeTab }) {
  const viewer = useViewer();
  const router = useRouter();
  const strip = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const all: { tab: HomeTab; label: string; badge: React.ReactNode }[] = [
    { tab: { kind: "foryou" }, label: "For You", badge: null },
    { tab: { kind: "friends" }, label: "Friends", badge: null },
    ...tabs.map((t) => ({ tab: { kind: t.kind, key: t.key } as HomeTab, label: t.label, badge: t.kind === "team" ? <TeamLogo team={t.team} size="sm" label={false} /> : null })),
  ];
  const cur = tabParam(active);
  const index = Math.max(0, all.findIndex((x) => tabParam(x.tab) === cur));

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [cur]);

  // Swipe on the feed to change tabs (ignores sideways scrollers and the screen edge).
  useEffect(() => {
    const el = document.getElementById("home-feed");
    if (!el) return;
    let s: { x: number; y: number } | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      s = t.clientX < 28 || (e.target as Element).closest?.("[data-no-swipe], input, textarea, [role=menu]") ? null : { x: t.clientX, y: t.clientY };
    };
    const end = (e: TouchEvent) => {
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      s = null;
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2.2) return;
      const next = all[index + (dx < 0 ? 1 : -1)];
      if (next) router.push(tabHref(next.tab), { scroll: false });
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => (el.removeEventListener("touchstart", start), el.removeEventListener("touchend", end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, all.length]);

  return (
    <>
      <div className="sticky top-[var(--sub-top)] z-20 border-b border-[var(--hairline)] bg-[var(--paper)]/95 backdrop-blur-md">
        <div className="flex items-center">
          <div ref={strip} role="tablist" aria-label="Home feed" data-no-swipe className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto px-1">
            {all.map((x) => {
              const on = tabParam(x.tab) === cur;
              return (
                <Link
                  key={tabParam(x.tab) || "foryou"}
                  href={tabHref(x.tab)}
                  scroll={false}
                  role="tab"
                  aria-selected={on}
                  className={`relative flex h-11 shrink-0 items-center gap-1.5 px-3.5 text-[14px] whitespace-nowrap transition-colors ${on ? "font-bold text-ink-1" : "font-medium text-ink-3 hover:text-ink-1"}`}
                >
                  {x.badge}
                  {x.label}
                  {on && <span aria-hidden="true" className="absolute inset-x-3.5 bottom-0 h-[2px] rounded-full bg-[var(--wn-blue)]" />}
                </Link>
              );
            })}
          </div>
          <button type="button" onClick={() => (viewer ? setAdding(true) : router.push("/login?next=/"))} aria-label="Add topics and teams" title="Add topics and teams" className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-3 hover:text-ink-1">
            <PlusIcon size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
      {viewer && <AddTabs open={adding} onClose={() => setAdding(false)} tabs={tabs} />}
    </>
  );
}

/** The "+" sheet: toggle topics, search teams, remove pinned tabs. */
function AddTabs({ open, onClose, tabs }: { open: boolean; onClose: () => void; tabs: FeedTab[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pinned, setPinned] = useState(tabs);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<TeamView[]>([]);
  useEffect(() => setPinned(tabs), [tabs]);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => fetch(`/api/teams?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setFound).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);
  const has = (kind: string, key: string) => pinned.some((t) => t.kind === kind && t.key === key);
  const toggle = (kind: "topic" | "team", key: string, label: string, team?: TeamView) => {
    const on = !has(kind, key);
    if (on && pinned.length >= MAX_FEED_TABS) return toast(`You can pin up to ${MAX_FEED_TABS} tabs. Remove one first.`, "error");
    const prev = pinned;
    setPinned(on ? [...pinned, (kind === "team" ? { kind, key, label, team: team! } : { kind, key, label }) as FeedTab] : pinned.filter((t) => !(t.kind === kind && t.key === key)));
    navigator.vibrate?.(6);
    void feedTabAction(kind, key, on).then((r) => {
      if (!r.ok) (setPinned(prev), toast(r.error, "error"));
      else router.refresh();
    });
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your tabs">
      <div className="space-y-5 px-4 pb-6">
        <section aria-labelledby="at-topics">
          <h3 id="at-topics" className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Topics</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TOPIC_LABEL).map(([key, label]) => {
              const on = has("topic", key);
              return (
                <button key={key} type="button" aria-pressed={on} onClick={() => toggle("topic", key, label)} className={`inline-flex min-h-11 items-center gap-2 rounded-[12px] pr-3.5 pl-2.5 text-[14px] font-bold transition-all active:scale-95 ${on ? "bg-[rgb(47_107_255/0.18)] text-ink-1 ring-1 ring-[var(--wn-blue)]" : "text-ink-2 ring-1 ring-rule"}`}>
                  <TopicBadge topic={key} /> {label} {on && <span aria-hidden="true" className="text-[var(--wn-cyan-ink)]">✓</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section aria-labelledby="at-teams">
          <h3 id="at-teams" className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Teams</h3>
          <label className="relative block">
            <span className="sr-only">Search teams</span>
            <SearchIcon size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams, e.g. Chiefs, Lakers, Arsenal" className="input !pl-10" />
          </label>
          {found.length > 0 && (
            <ul className="mt-2 space-y-1">
              {found.map((t) => {
                const on = has("team", t.id);
                return (
                  <li key={t.id}>
                    <button type="button" aria-pressed={on} onClick={() => toggle("team", t.id, t.name, t)} className="flex min-h-12 w-full items-center gap-3 rounded-[12px] px-2 text-left hover:bg-white/[0.05]">
                      <TeamLogo team={t} size="md" label={false} />
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{t.fullName}</span>
                      <span className={`rounded-[9px] px-2.5 py-1.5 text-[12.5px] font-bold ${on ? "bg-[rgb(47_107_255/0.18)] text-[var(--wn-blue-ink)]" : "bg-[var(--wn-blue-fill)] text-white"}`}>{on ? "Added ✓" : "Add"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {q.trim().length >= 2 && found.length === 0 && <p className="mt-2 text-[13.5px] text-ink-3">No teams match &ldquo;{q}&rdquo;.</p>}
        </section>
        <section aria-labelledby="at-pinned">
          <h3 id="at-pinned" className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Pinned ({pinned.length}/{MAX_FEED_TABS})</h3>
          {pinned.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">No tabs pinned. Pick a topic above to start.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {pinned.map((t) => (
                <li key={`${t.kind}:${t.key}`} className="inline-flex items-center gap-1.5 rounded-[12px] bg-white/[0.04] py-0 pr-0 pl-2.5 text-[13.5px] font-semibold ring-1 ring-rule">
                  {t.kind === "team" ? <TeamLogo team={t.team} size="sm" label={false} /> : <TopicBadge topic={t.key} />} {t.label}
                  <button type="button" onClick={() => toggle(t.kind, t.key, t.label)} aria-label={`Remove ${t.label}`} className="inline-flex h-11 w-10 items-center justify-center rounded-[12px] text-ink-3 hover:text-disagree"><CloseIcon size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  );
}
