"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "../ui/Avatar";
import { LogoMark, Wordmark } from "../ui/Logo";
import { Menu } from "../ui/Menu";
import { EditionIcon, InboxIcon, KeyboardIcon, LogoutIcon, MonitorIcon, MoonIcon, RundownIcon, SearchIcon, SettingsIcon, ShieldIcon, SunIcon, TakeIcon, UserIcon } from "../icons";
import { useComposer, usePalette, useRundown, useShortcutsHelp, useViewer } from "../providers";
import { applyTheme } from "./ThemeToggle";

/** "Thursday, November 20, 2026", edition No. = day of the year. */
function useEdition() {
  const [d, setD] = useState<{ date: string; no: number } | null>(null);
  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    setD({ date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }), no: Math.floor((+now - +start) / 86_400_000) });
  }, []);
  return d;
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="mono absolute -top-0.5 -right-0.5 min-w-[16px] rounded-[2px] bg-live-bg px-[3px] text-center text-[9.5px] leading-[15px] font-bold text-white">{n > 99 ? "99+" : n}</span>;
}

/** Newspaper masthead: edition line, serif wordmark, search, Newsdesk, Take it, byline chip. */
export function Masthead({ unread }: { unread: number }) {
  const viewer = useViewer();
  const router = useRouter();
  const openComposer = useComposer();
  const openSearch = usePalette();
  const openRundown = useRundown();
  const openShortcuts = useShortcutsHelp();
  const ed = useEdition();
  const icon = "relative inline-flex h-10 w-10 items-center justify-center rounded-[4px] text-ink-1 transition-colors hover:bg-paper-2";

  const account = viewer
    ? [
        { label: "Your byline", icon: <UserIcon size={18} />, onSelect: () => router.push(`/u/${viewer.handle}`) },
        { label: "Rundown", icon: <RundownIcon size={18} />, onSelect: openRundown },
        { label: "Morning Edition", icon: <EditionIcon size={18} />, onSelect: () => router.push("/briefing") },
        ...(viewer.isAdmin ? [{ label: "Control Room", icon: <ShieldIcon size={18} />, onSelect: () => router.push("/admin") }] : []),
        { label: "Settings", icon: <SettingsIcon size={18} />, onSelect: () => router.push("/settings") },
        "divider" as const,
        { label: "Dark", icon: <MoonIcon size={18} />, onSelect: () => applyTheme("dark") },
        { label: "Light", icon: <SunIcon size={18} />, onSelect: () => applyTheme("light") },
        { label: "Match device", icon: <MonitorIcon size={18} />, onSelect: () => applyTheme("system") },
        { label: "Keyboard shortcuts", icon: <KeyboardIcon size={18} />, onSelect: openShortcuts, hint: "?" },
        "divider" as const,
        { label: "Log out", icon: <LogoutIcon size={18} />, onSelect: () => logoutAction() },
      ]
    : [];

  return (
    <header className="relative bg-[var(--masthead)]">
      {/* Edition line (desktop) */}
      <div className="relative mx-auto hidden h-8 max-w-[1320px] items-center justify-between border-b border-rule px-8 lg:flex">
        <p className="mono text-[11px] tracking-wide text-ink-3 uppercase" suppressHydrationWarning>
          {ed ? `${ed.date} · National Edition · No. ${ed.no}` : " "}
        </p>
        <nav aria-label="Sections" className="flex items-center gap-5 text-[12px] font-semibold text-ink-2">
          <Link href="/briefing" className="hover:text-navy-ink">Morning Edition</Link>
          <Link href="/live" className="hover:text-navy-ink">Live Studio</Link>
          <Link href="/explore" className="hover:text-navy-ink">Hot Stories</Link>
          {viewer?.isAdmin && <Link href="/admin" className="text-gold-ink hover:underline">Control Room</Link>}
        </nav>
      </div>

      <div className="relative mx-auto grid h-[var(--header-h)] max-w-[1320px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 lg:h-[92px] lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        {/* left */}
        <div className="flex items-center gap-1">
          <Link href="/" aria-label="Townsquare front page" className="flex items-center gap-2 lg:hidden">
            <LogoMark size={28} />
            <Wordmark size="sm" />
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            {viewer && (
              <button type="button" onClick={openRundown} className="btn-ghost !min-h-10 !px-3 !text-[13px]">
                <RundownIcon size={18} /> Rundown
              </button>
            )}
            <button type="button" onClick={openSearch} className="flex h-10 items-center gap-2 rounded-[4px] px-3 text-[13px] text-ink-3 ring-1 ring-rule transition-colors hover:text-ink-1 hover:ring-rule-strong">
              <SearchIcon size={17} /> Search <kbd className="mono ml-3 rounded-[2px] bg-paper-2 px-1.5 text-[10.5px]">⌘K</kbd>
            </button>
          </div>
        </div>
        {/* center wordmark (desktop) */}
        <Link href="/" aria-label="Townsquare front page" className="hidden flex-col items-center lg:flex">
          <span className="flex items-center gap-3">
            <LogoMark size={44} />
            <Wordmark size="lg" />
          </span>
          <span className="folio mt-1.5 !text-[9.5px] !tracking-[0.32em] text-ink-3">Say it · Read it · Debate it</span>
        </Link>
        {/* right */}
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={openSearch} className={`${icon} lg:hidden`} aria-label="Search"><SearchIcon size={20} /></button>
          {viewer ? (
            <>
              <Link href="/notifications" className={icon} aria-label={`Newsdesk${unread ? `, ${unread} new` : ""}`} title="Newsdesk">
                <InboxIcon size={20} />
                <Badge n={unread} />
              </Link>
              <button type="button" onClick={() => openComposer()} className="btn-primary ml-1 hidden !min-h-10 !px-4 lg:inline-flex">
                <TakeIcon size={17} /> Take it
              </button>
              <div className="ml-1 hidden lg:block">
                <Menu label="Account" button={<span className="flex items-center gap-2 pr-1"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} /><span className="max-w-[120px] truncate text-[13px] font-semibold text-ink-1">{viewer.displayName}</span></span>} buttonClassName="flex h-10 items-center rounded-[4px] pl-1 hover:bg-paper-2" items={account} />
              </div>
              <Link href={`/u/${viewer.handle}`} className="ml-1 lg:hidden" aria-label="Your byline"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} /></Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !min-h-10 !px-3 !text-[13px]">Log in</Link>
              <Link href="/signup" className="btn-primary !min-h-10 !px-4 !text-[13px]">Join</Link>
            </>
          )}
        </div>
      </div>
      <div aria-hidden="true" className="double-rule relative" />
    </header>
  );
}
