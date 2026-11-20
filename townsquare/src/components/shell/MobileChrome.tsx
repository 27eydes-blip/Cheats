"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Avatar } from "../ui/Avatar";
import { Logo } from "../ui/Logo";
import { BellIcon, CommunityIcon, HomeIcon, LiveIcon, NewsIcon, PlusIcon, SearchIcon, UserIcon } from "../icons";
import { useComposer, usePalette, useViewer } from "../providers";
import { isActive } from "./nav-items";

/** Hides the phone app bar while scrolling down and brings it back on scroll up. */
function useAutoHideChrome() {
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const root = document.documentElement;
    const on = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 80 || y < last - 6) root.dataset.chrome = "shown";
        else if (y > last + 6) root.dataset.chrome = "hidden";
        last = y;
        ticking = false;
      });
    };
    root.dataset.chrome = "shown";
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
}

/** Phone top bar (glass): logo, search, notifications. */
export function TopBar({ unread }: { unread: number }) {
  const viewer = useViewer();
  const openPalette = usePalette();
  useAutoHideChrome();
  return (
    <header className="appbar glass sticky top-0 z-30 border-b border-line sm:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex h-[var(--header-h)] items-center justify-between px-4">
        <Logo />
        <div className="-mr-1.5 flex items-center">
          <button type="button" onClick={openPalette} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-1 active:bg-surface-2" aria-label="Search">
            <SearchIcon size={21} />
          </button>
          {viewer ? (
            <Link href="/notifications" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-1 active:bg-surface-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <BellIcon size={21} />
              {unread > 0 && <span className="num absolute top-1.5 right-1 min-w-[17px] rounded-full bg-breaking px-1 text-center text-[10px] leading-[17px] font-bold text-white ring-2 ring-canvas">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          ) : (
            <Link href="/login" className="btn-primary ml-1 !min-h-9 !px-3.5 !text-[13.5px]">Log in</Link>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Floating glass tab bar with the compose button docked beside it, so it never
 * sits on top of content (pages reserve the space with .pb-tabbar).
 */
export function TabBar({ liveCount }: { liveCount: number }) {
  const viewer = useViewer();
  const path = usePathname();
  const openComposer = useComposer();
  const tabs = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/news", label: "News", icon: NewsIcon },
    { href: "/communities", label: "Groups", icon: CommunityIcon },
    { href: "/live", label: "Live", icon: LiveIcon },
    { href: viewer ? `/u/${viewer.handle}` : "/login", label: "Profile", icon: UserIcon },
  ];
  // Focused flows (auth, onboarding) get the whole screen.
  if (/^\/(login|signup|welcome)/.test(path)) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-end gap-2 px-3 sm:hidden" style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
      <nav aria-label="Tabs" className="glass-strong flex-1 rounded-[22px] border border-line shadow-3">
        <ul className="grid h-[var(--tabbar-h)] grid-cols-5">
          {tabs.map(({ href, label, icon: Icon }) => {
            const on = isActive(path, href);
            const isProfile = label === "Profile" && viewer;
            return (
              <li key={label}>
                <Link href={href} aria-current={on ? "page" : undefined} className="relative flex h-full flex-col items-center justify-center gap-[3px] text-[10.5px] font-semibold active:scale-95">
                  {isProfile ? (
                    <span className={`rounded-full ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-transparent" : ""}`}>
                      <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={24} ring={false} />
                    </span>
                  ) : (
                    <span className="relative">
                      <Icon size={23} strokeWidth={on ? 2.4 : 1.8} className={on ? "text-accent" : "text-ink-2"} />
                      {label === "Live" && liveCount > 0 && <span className="absolute -top-0.5 -right-1 h-2 w-2 animate-live rounded-full bg-live" />}
                    </span>
                  )}
                  <span className={on ? "text-ink-1" : "text-ink-3"}>{label === "Groups" ? "Communities" : label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={() => openComposer()}
        aria-label="New post"
        className="flex h-[var(--tabbar-h)] w-[var(--tabbar-h)] shrink-0 items-center justify-center rounded-[22px] bg-accent-grad text-white shadow-glow transition-transform active:scale-90"
      >
        <PlusIcon size={26} strokeWidth={2.4} />
      </button>
    </div>
  );
}
