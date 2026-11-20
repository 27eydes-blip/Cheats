"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";
import { CommunityIcon, HashIcon, MoonIcon, NewsIcon, PlusIcon, SearchIcon } from "../icons";
import { useViewer } from "../providers";
import { applyTheme } from "./ThemeToggle";
import { navItems } from "./nav-items";

type Item = { id: string; group: string; label: string; sub?: string; icon: React.ReactNode; run: () => void };
type Remote = {
  people: { handle: string; displayName: string; avatarUrl: string | null; verified: boolean }[];
  tags: { tag: string; posts: number }[];
  communities: { slug: string; name: string }[];
  stories: { key: string; title: string; status: string }[];
};

/** Cmd/Ctrl+K: jump anywhere, find people, topics, communities, and stories, or run an action. */
export function CommandPalette({ open, onClose, onCompose }: { open: boolean; onClose: () => void; onCompose: () => void }) {
  const router = useRouter();
  const viewer = useViewer();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Remote | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setSel(0);
      d.showModal();
      setTimeout(() => input.current?.focus(), 10);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/palette?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setRemote)
        .catch(() => {});
    }, 120);
    return () => (clearTimeout(t), ctrl.abort());
  }, [q, open]);

  const go = (href: string) => () => (onClose(), router.push(href));
  const items = useMemo<Item[]>(() => {
    const ql = q.toLowerCase();
    const nav = navItems(viewer)
      .filter((n) => !ql || n.label.toLowerCase().includes(ql))
      .map((n) => ({ id: `nav-${n.key}`, group: "Go to", label: n.label, icon: <n.icon size={18} />, run: go(n.href) }));
    const actions: Item[] = [
      ...(viewer ? [{ id: "compose", group: "Actions", label: "New post", sub: "N", icon: <PlusIcon size={18} />, run: () => (onClose(), onCompose()) }] : []),
      { id: "dark", group: "Actions", label: "Toggle dark mode", icon: <MoonIcon size={18} />, run: () => (applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"), onClose()) },
    ].filter((a) => !ql || a.label.toLowerCase().includes(ql));
    const r = remote;
    const found: Item[] = r
      ? [
          ...r.people.map((p) => ({ id: `u-${p.handle}`, group: "People", label: p.displayName, sub: `@${p.handle}`, icon: <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={24} ring={false} />, run: go(`/u/${p.handle}`) })),
          ...r.stories.map((s) => ({ id: `s-${s.key}`, group: "Stories", label: s.title, sub: s.status === "live" ? "LIVE" : undefined, icon: <NewsIcon size={18} />, run: go(`/news/story/${s.key}`) })),
          ...r.tags.map((t) => ({ id: `t-${t.tag}`, group: q ? "Topics" : "Trending", label: `#${t.tag}`, sub: `${t.posts} posts`, icon: <HashIcon size={18} />, run: go(`/search?q=${encodeURIComponent(`#${t.tag}`)}`) })),
          ...r.communities.map((c) => ({ id: `c-${c.slug}`, group: "Communities", label: c.name, sub: `c/${c.slug}`, icon: <CommunityIcon size={18} />, run: go(`/c/${c.slug}`) })),
        ]
      : [];
    const search: Item[] = q.trim() ? [{ id: "search", group: "Search", label: `Search for “${q.trim()}”`, icon: <SearchIcon size={18} />, run: go(`/search?q=${encodeURIComponent(q.trim())}`) }] : [];
    return [...search, ...found, ...nav, ...actions];
  }, [q, remote, viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    ref.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
    else if (e.key === "Enter") (e.preventDefault(), items[sel]?.run());
  };

  let lastGroup = "";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search and commands"
      className="m-0 mx-auto mt-0 h-[100dvh] max-h-none w-full max-w-none bg-surface p-0 text-ink-1 shadow-3 sm:mt-[12vh] sm:h-auto sm:max-h-[min(560px,76vh)] sm:w-[calc(100%-2rem)] sm:max-w-[620px] sm:rounded-[var(--r-xl)] sm:border sm:border-line"
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col" onKeyDown={onKey}>
          <div className="flex items-center gap-3 border-b border-line px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <SearchIcon size={20} className="text-ink-3" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, topics, stories, or jump to…"
              className="h-14 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={items[sel] ? `pal-${items[sel].id}` : undefined}
              enterKeyHint="go"
            />
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[12px] font-semibold text-ink-3 ring-1 ring-line hover:text-ink-1">
              <span className="hidden sm:inline">Esc</span><span className="sm:hidden">Cancel</span>
            </button>
          </div>
          <ul id="palette-list" role="listbox" className="flex-1 overflow-y-auto overscroll-contain p-2">
            {items.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              return (
                <li key={it.id} role="presentation">
                  {header && <p className="kicker px-3 pt-3 pb-1.5 text-ink-3">{header}</p>}
                  <button
                    type="button"
                    id={`pal-${it.id}`}
                    role="option"
                    aria-selected={i === sel}
                    data-idx={i}
                    onMouseMove={() => setSel(i)}
                    onClick={it.run}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left transition-colors ${i === sel ? "bg-accent-soft text-ink-1" : "text-ink-2"}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${i === sel ? "text-accent" : "text-ink-3"}`}>{it.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{it.label}</span>
                    {it.sub === "LIVE" ? <span className="rounded bg-live px-1.5 text-[10px] font-black text-white">LIVE</span> : it.sub && <span className="truncate text-[12.5px] text-ink-3">{it.sub}</span>}
                    {it.id.startsWith("u-") && remote?.people.find((p) => `u-${p.handle}` === it.id)?.verified && <VerifiedSeal size={14} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-[12px] text-ink-3 sm:flex">
            <span><kbd className="rounded bg-surface-2 px-1">↑</kbd> <kbd className="rounded bg-surface-2 px-1">↓</kbd> to move</span>
            <span><kbd className="rounded bg-surface-2 px-1">↵</kbd> to open</span>
            <span className="ml-auto">Shortcuts: <kbd className="rounded bg-surface-2 px-1">?</kbd></span>
          </div>
        </div>
      )}
    </dialog>
  );
}
