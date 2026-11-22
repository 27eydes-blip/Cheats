"use client";

import type { FeedTab } from "@/lib/feedtabs";
import { YourTopics } from "../feed/YourTopics";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/actions/auth";
import { switchAccountAction } from "@/actions/menu";
import { FEATURES } from "@/config";
import { ChevronRight, CloseIcon, LogoutIcon, SwitchIcon } from "../icons";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";
import { LogoMark, Wordmark } from "../ui/Logo";
import { isActive, menuItems, type MenuEntry } from "./menu";
import { MenuGlyph } from "./MenuIcons";
import { ThemeCycle, ThemeToggle } from "./ThemeToggle";

export type MenuViewer = { id: string; handle: string; displayName: string; avatarUrl: string | null; isAdmin: boolean; verified?: boolean } | null;
export type MenuStats = { followers: number; following: number; friends: number };

/**
 * The slide-out side menu (phones and tablets). A modal <dialog>, so focus is
 * trapped and Escape closes it; it also closes on an outside tap, a swipe to
 * the left, or after choosing a destination. The page behind dims and blurs.
 */
export function SideMenu({ open, onClose, viewer, stats, wallet = FEATURES.wallet, topics = [] }: { open: boolean; onClose: () => void; viewer: MenuViewer; stats: MenuStats | null; wallet?: boolean; topics?: FeedTab[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname() ?? "/";
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) (setDx(0), d.showModal());
    if (!open && d.open) d.close();
  }, [open]);
  // Close after navigating.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const { main, more } = menuItems({ handle: viewer?.handle ?? null, isAdmin: !!viewer?.isAdmin, wallet });
  const row = (m: MenuEntry) => {
    const on = isActive(path, m.href);
    return (
      <li key={m.key}>
        <Link
          href={m.href}
          onClick={onClose}
          aria-current={on ? "page" : undefined}
          className={`group flex min-h-12 items-center gap-3.5 rounded-[14px] px-3 transition-all duration-150 active:scale-[0.98] active:bg-white/[0.08] ${on ? "bg-[rgb(47_107_255/0.16)] text-ink-1 shadow-[inset_3px_0_0_var(--wn-blue)]" : "text-ink-1 hover:bg-white/[0.05]"}`}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${on ? "bg-[var(--wn-blue-fill)] text-white" : "bg-white/[0.05] text-ink-2 group-hover:text-[var(--wn-cyan-ink)]"}`}><MenuGlyph name={m.icon} size={20} strong={on} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] leading-tight font-bold">{m.label}</span>
            {m.hint && <span className="block truncate text-[12px] text-ink-3">{m.hint}</span>}
          </span>
          <ChevronRight size={16} className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      </li>
    );
  };

  return (
    <dialog
      ref={ref}
      aria-label="Menu"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      onTouchStart={(e) => (drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false })}
      onTouchMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const mx = e.touches[0].clientX - d.x;
        const my = e.touches[0].clientY - d.y;
        if (!d.on && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) d.on = true;
        if (d.on) setDx(Math.min(0, mx));
      }}
      onTouchEnd={() => {
        if (drag.current?.on && dx < -80) onClose();
        setDx(0);
        drag.current = null;
      }}
      className="side-menu fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(88vw,348px)] max-w-none overflow-hidden border-r border-[var(--wn-glass-border)] bg-[var(--wn-panel-1)] p-0 text-ink-1 shadow-3"
      style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: drag.current?.on ? "none" : "transform 280ms var(--ease-out)" }}
    >
      {open && (
        <div className="flex h-full flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)" }}>
          {/* Profile header card */}
          <div className="relative m-3 overflow-hidden rounded-[20px] p-4 ring-1 ring-[var(--wn-glass-border)]" style={{ background: "radial-gradient(120% 90% at 0% 0%, rgb(47 107 255 / 0.38), transparent 60%), radial-gradient(80% 70% at 100% 0%, rgb(34 211 238 / 0.2), transparent 65%), var(--wn-panel-2)" }}>
            <div className="flex items-start justify-between gap-2">
              {viewer ? (
                <Link href={`/u/${viewer.handle}`} onClick={onClose} aria-label="Your profile" className="rounded-[18px] ring-2 ring-white/25 transition-transform active:scale-95">
                  <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={64} />
                </Link>
              ) : (
                <LogoMark size={52} />
              )}
              <span className="flex items-center gap-1">
                <ThemeCycle className="bg-white/[0.07] text-ink-1 hover:bg-white/[0.14]" />
                <button type="button" onClick={onClose} aria-label="Close menu" className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/[0.07] text-ink-1 hover:bg-white/[0.14]"><CloseIcon size={20} /></button>
              </span>
            </div>
            {viewer ? (
              <>
                <p className="mt-3 flex items-center gap-1.5 font-display text-[24px] leading-none font-extrabold">{viewer.displayName}{viewer.verified && <VerifiedSeal size={18} />}</p>
                <p className="mono mt-1 text-[13px] text-ink-2">@{viewer.handle}</p>
                {stats && (
                  <ul className="mt-3 grid grid-cols-3 gap-1.5">
                    {([["Followers", stats.followers, "followers"], ["Following", stats.following, "following"], ["Friends", stats.friends, "friends"]] as const).map(([label, n, seg]) => (
                      <li key={seg}>
                        <Link href={`/u/${viewer.handle}/${seg}`} onClick={onClose} className="flex min-h-[52px] flex-col items-start justify-center rounded-[12px] bg-[rgb(7_11_20/0.35)] px-3 text-[12px] leading-tight ring-1 ring-white/10 transition-all hover:ring-[var(--wn-cyan)] active:scale-95 [html.light_&]:bg-white/70">
                          <b className="mono text-[15px]">{n.toLocaleString("en-US")}</b><span className="text-ink-2">{label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="mt-3"><Wordmark size="md" /></p>
                <p className="mt-1 text-[13.5px] text-ink-2">Log in to dispatch, react and build your feed.</p>
                <div className="mt-3 flex gap-2">
                  <Link href="/login" onClick={onClose} className="btn-outline flex-1">Log in</Link>
                  <Link href="/signup" onClick={onClose} className="btn-primary flex-1">Join</Link>
                </div>
              </>
            )}
          </div>

          {/* Destinations */}
          <nav aria-label="Menu" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
            {viewer && <div className="mb-3 border-b border-rule pb-3"><YourTopics tabs={topics} onNavigate={onClose} /></div>}
            <ul className="space-y-0.5">{main.map(row)}</ul>
            {more.length > 0 && (
              <>
                <p className="mt-4 mb-1 px-3 text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">More</p>
                <ul className="space-y-0.5">{more.map(row)}</ul>
              </>
            )}
          </nav>

          {/* Account + theme */}
          <div className="space-y-2 border-t border-rule px-3 pt-3 pb-3">
            {viewer && (
              <div className="flex gap-2">
                <form action={switchAccountAction} className="flex-1">
                  <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-left transition-all hover:bg-white/[0.05] active:scale-[0.98]">
                    <SwitchIcon size={20} className="text-ink-2" />
                    <span><span className="block text-[14.5px] font-bold">Switch account</span><span className="block text-[12px] text-ink-3">Sign in as someone else</span></span>
                  </button>
                </form>
                <form action={logoutAction}>
                  <button type="submit" aria-label="Log out" title="Log out" className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] text-ink-2 hover:bg-white/[0.05] hover:text-disagree"><LogoutIcon size={20} /></button>
                </form>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
