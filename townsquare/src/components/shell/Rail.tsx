"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FEATURES } from "@/config";
import { PanelIcon } from "../icons";
import { Avatar } from "../ui/Avatar";
import { isActive, menuItems, TABS, type MenuEntry } from "./menu";
import { MenuGlyph } from "./MenuIcons";
import type { MenuViewer } from "./SideMenu";
import { ThemeCycle } from "./ThemeToggle";

/**
 * Desktop side menu: a persistent left rail. Wide screens show labels; the
 * panel button collapses it to icons (remembered in a cookie so the page
 * renders at the right width with no jump).
 */
export function Rail({ viewer, unread, unreadMessages }: { viewer: MenuViewer; unread: number; unreadMessages: number }) {
  const path = usePathname() ?? "/";
  const { main, more } = menuItems({ handle: viewer?.handle ?? null, isAdmin: !!viewer?.isAdmin, wallet: FEATURES.wallet });
  const toggle = () => {
    const el = document.documentElement;
    const open = parseFloat(getComputedStyle(el).getPropertyValue("--rail-w")) > 100;
    const next = open ? "closed" : "open";
    el.dataset.rail = next;
    document.cookie = `rail=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  const badge = (key: string) => (key === "alerts" ? unread : key === "messages" ? unreadMessages : 0);
  const row = (m: MenuEntry) => {
    const on = isActive(path, m.href);
    const n = badge(m.key);
    return (
      <li key={m.key}>
        <Link
          href={m.href}
          title={m.label}
          aria-current={on ? "page" : undefined}
          className={`group relative flex h-11 items-center gap-3 rounded-[12px] px-[11px] text-[14.5px] font-bold transition-all duration-150 active:scale-[0.97] ${on ? "bg-[rgb(47_107_255/0.18)] text-ink-1 shadow-[inset_3px_0_0_var(--wn-blue)]" : "text-ink-2 hover:bg-white/[0.06] hover:text-ink-1"}`}
        >
          <span className={`relative flex h-[22px] w-[22px] shrink-0 items-center justify-center ${on ? "text-[var(--wn-blue-ink)]" : "group-hover:text-[var(--wn-cyan-ink)]"}`}>
            <MenuGlyph name={m.icon} strong={on} />
            {n > 0 && <span className="mono absolute -top-1.5 -right-2 min-w-[16px] rounded-full bg-live-bg px-1 text-center text-[9.5px] leading-[16px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
          </span>
          <span className="rail-label truncate">{m.label}</span>
          {n > 0 && <span className="sr-only">, {n} new</span>}
        </Link>
      </li>
    );
  };
  return (
    <aside aria-label="Side menu" className="fixed inset-y-0 left-0 z-[45] hidden w-[var(--rail-w)] flex-col border-r border-[var(--wn-glass-border)] bg-[var(--wn-panel-1)] transition-[width] duration-200 lg:flex">
      <div className="flex h-[68px] shrink-0 items-center px-[14px]">
        <button type="button" onClick={toggle} aria-label="Collapse or expand the side menu" title="Collapse / expand" className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] text-ink-2 hover:bg-white/[0.06] hover:text-ink-1"><PanelIcon size={21} /></button>
      </div>
      <nav aria-label="Side menu" className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-[14px] pb-3">
        <ul className="space-y-0.5">{TABS.filter((t) => t.key !== "markets").map(row)}</ul>
        <hr className="my-2.5 border-rule" />
        <ul className="space-y-0.5">{main.map(row)}</ul>
        {more.length > 0 && (
          <>
            <hr className="my-2.5 border-rule" />
            <ul className="space-y-0.5">{more.map(row)}</ul>
          </>
        )}
      </nav>
      <div className="flex shrink-0 items-center gap-2 border-t border-rule px-[14px] py-3">
        {viewer ? (
          <Link href={`/u/${viewer.handle}`} title={viewer.displayName} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] p-1 hover:bg-white/[0.06]">
            <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={38} />
            <span className="rail-label min-w-0"><span className="block truncate text-[13.5px] font-bold">{viewer.displayName}</span><span className="mono block truncate text-[11.5px] text-ink-3">@{viewer.handle}</span></span>
          </Link>
        ) : (
          <Link href="/login" className="rail-label btn-primary flex-1 !min-h-11">Log in</Link>
        )}
        <span className="rail-label"><ThemeCycle className="text-ink-2 hover:bg-white/[0.06]" /></span>
      </div>
    </aside>
  );
}
