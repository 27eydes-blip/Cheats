"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "../ui/Avatar";
import { LogoMark, Wordmark } from "../ui/Logo";
import { APP_NAME } from "@/config";
import { Menu } from "../ui/Menu";
import { EditionIcon, InboxIcon, KeyboardIcon, LogoutIcon, MonitorIcon, MoonIcon, RundownIcon, SearchIcon, SettingsIcon, ShieldIcon, SunIcon, TakeIcon, UserIcon } from "../icons";
import { useComposer, useMenu, usePalette, useRundown, useShortcutsHelp, useViewer } from "../providers";
import type { WireQuote } from "./LiveWire";
import { MiniTicker } from "./MiniTicker";
import { applyTheme } from "./ThemeToggle";

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="mono absolute -top-0.5 -right-0.5 min-w-[16px] rounded-full bg-live-bg px-[4px] ring-2 ring-[var(--masthead)] text-center text-[9.5px] leading-[15px] font-bold text-white">{n > 99 ? "99+" : n}</span>;
}

/**
 * Electric-blue header bar. Phones: avatar (opens the side menu), centered logo,
 * mini market ticker; sticky. Desktop: logo, search, Rundown, Alerts, Dispatch, account.
 */
export function Masthead({ unread, tape }: { unread: number; tape: WireQuote[] }) {
  const viewer = useViewer();
  const router = useRouter();
  const openComposer = useComposer();
  const openSearch = usePalette();
  const openRundown = useRundown();
  const openMenu = useMenu();
  const openShortcuts = useShortcutsHelp();
  const icon = "relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[#b8c2d9] transition-colors hover:bg-white/[0.08] hover:text-white";

  const account = viewer
    ? [
        { label: "Your byline", icon: <UserIcon size={18} />, onSelect: () => router.push(`/u/${viewer.handle}`) },
        { label: "Rundown", icon: <RundownIcon size={18} />, onSelect: openRundown },
        { label: "Morning Edition", icon: <EditionIcon size={18} />, onSelect: () => router.push("/briefing") },
        ...(viewer.isAdmin ? [{ label: "Control Room", icon: <ShieldIcon size={18} />, onSelect: () => router.push("/admin") }] : []),
        { label: "Settings", icon: <SettingsIcon size={18} />, onSelect: () => router.push("/settings") },
        "divider" as const,
        { label: "Dark (default)", icon: <MoonIcon size={18} />, onSelect: () => applyTheme("dark") },
        { label: "Light", icon: <SunIcon size={18} />, onSelect: () => applyTheme("light") },
        { label: "Match device", icon: <MonitorIcon size={18} />, onSelect: () => applyTheme("system") },
        { label: "Keyboard shortcuts", icon: <KeyboardIcon size={18} />, onSelect: openShortcuts, hint: "?" },
        "divider" as const,
        { label: "Log out", icon: <LogoutIcon size={18} />, onSelect: () => logoutAction() },
      ]
    : [];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--masthead)]/95 text-white backdrop-blur-md lg:static" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Phone / tablet: avatar (opens the side menu) · logo · mini market ticker */}
      <div className="relative grid h-[var(--header-h)] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 lg:hidden">
        <div className="flex items-center">
          <button type="button" onClick={openMenu} aria-label="Open menu" aria-haspopup="dialog" className="relative inline-flex h-11 w-11 items-center justify-center rounded-[14px] transition-transform active:scale-90">
            {viewer ? (
              <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-[#b8c2d9]"><UserIcon size={18} /></span>
            )}
          </button>
        </div>
        <Link href="/" aria-label={`${APP_NAME} home`} className="flex min-h-11 items-center gap-2">
          <LogoMark size={24} className="rounded-[6px]" />
          <Wordmark size="sm" short className="!text-[1.2rem]" />
        </Link>
        <div className="flex items-center justify-end"><MiniTicker quotes={tape} /></div>
      </div>

      {/* Desktop */}
      <div className="relative mx-auto hidden h-[56px] max-w-[1320px] items-center gap-3 px-8 lg:flex">
        <Link href="/" aria-label={`${APP_NAME} front page`} className="group flex shrink-0 items-center gap-2.5">
          <LogoMark size={30} className="rounded-[7px]" />
          <Wordmark size="sm" />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={openSearch} className="flex h-9 items-center gap-2 rounded-full bg-white/[0.05] px-3.5 text-[13px] text-[#b8c2d9] ring-1 ring-white/10 transition-colors hover:text-white hover:ring-white/25">
            <SearchIcon size={17} /> Search <kbd className="mono ml-4 rounded-[5px] bg-white/15 px-1.5 text-[10.5px]">⌘K</kbd>
          </button>
          {viewer ? (
            <>
              <button type="button" onClick={openRundown} className={icon} aria-label="Rundown" title="Rundown"><RundownIcon size={20} /></button>
              <Link href="/notifications" className={icon} aria-label={`Alerts${unread ? `, ${unread} new` : ""}`} title="Alerts">
                <InboxIcon size={20} />
                <Badge n={unread} />
              </Link>
              <button type="button" onClick={() => openComposer()} className="btn ml-1 !min-h-9 !rounded-full bg-[var(--wn-blue-fill)] !px-4 !text-[13.5px] font-bold text-white hover:brightness-110">
                <TakeIcon size={17} /> Dispatch
              </button>
              <div className="ml-1">
                <Menu label="Account" button={<span className="flex items-center gap-2 pr-2"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} /><span className="hidden max-w-[120px] truncate text-[13px] font-semibold text-white 2xl:block">{viewer.displayName}</span></span>} buttonClassName="flex h-10 items-center rounded-[10px] pl-1 hover:bg-white/15" items={account} />
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn !min-h-10 !px-3 !text-[13px] font-semibold text-white hover:bg-white/15">Log in</Link>
              <Link href="/signup" className="btn !min-h-9 !rounded-full bg-[var(--wn-blue-fill)] !px-4 !text-[13px] font-bold text-white hover:brightness-110">Join</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
