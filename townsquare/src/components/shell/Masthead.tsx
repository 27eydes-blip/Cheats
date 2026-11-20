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
  const icon = "relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-white transition-colors hover:bg-white/15";

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
    <header className="sticky top-0 z-40 bg-[var(--masthead)] text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_10px_30px_-12px_rgb(47_107_255/0.8)] lg:static" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* light sweep across the bar */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent motion-safe:animate-[sweep_7s_ease-in-out_infinite]" />
      </div>

      {/* Phone / tablet: avatar (opens the side menu) · logo · mini market ticker */}
      <div className="relative grid h-[var(--header-h)] grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 lg:hidden">
        <div className="flex items-center">
          <button type="button" onClick={openMenu} aria-label="Open menu" aria-haspopup="dialog" className="relative inline-flex h-11 w-11 items-center justify-center rounded-[14px] transition-transform active:scale-90">
            {viewer ? (
              <span className="rounded-[12px] ring-2 ring-white/60"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={34} /></span>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#0b1220]/35 ring-1 ring-white/40"><UserIcon size={20} /></span>
            )}
          </button>
        </div>
        <Link href="/" aria-label={`${APP_NAME} home`} className="flex min-h-11 items-center gap-2">
          <LogoMark size={30} className="rounded-[8px] shadow-[0_0_0_1.5px_rgb(255_255_255/0.55)]" />
          <Wordmark size="sm" short />
        </Link>
        <div className="flex items-center justify-end"><MiniTicker quotes={tape} /></div>
      </div>

      {/* Desktop */}
      <div className="relative mx-auto hidden h-[68px] max-w-[1320px] items-center gap-3 px-8 lg:flex">
        <Link href="/" aria-label={`${APP_NAME} front page`} className="group flex shrink-0 items-center gap-2.5">
          <LogoMark size={40} className="rounded-[9px] shadow-[0_0_0_1.5px_rgb(255_255_255/0.55),0_6px_18px_rgb(4_10_30/0.45)] transition-transform duration-300 group-hover:rotate-[-8deg]" />
          <Wordmark size="md" />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={openSearch} className="flex h-10 items-center gap-2 rounded-[10px] bg-[#070b14]/25 px-3 text-[13px] text-white ring-1 ring-white/25 transition-all hover:bg-[#070b14]/40 hover:ring-white/60">
            <SearchIcon size={17} /> Search <kbd className="mono ml-4 rounded-[5px] bg-white/15 px-1.5 text-[10.5px]">⌘K</kbd>
          </button>
          {viewer ? (
            <>
              <button type="button" onClick={openRundown} className={icon} aria-label="Rundown" title="Rundown"><RundownIcon size={20} /></button>
              <Link href="/notifications" className={icon} aria-label={`Alerts${unread ? `, ${unread} new` : ""}`} title="Alerts">
                <InboxIcon size={20} />
                <Badge n={unread} />
              </Link>
              <button type="button" onClick={() => openComposer()} className="btn ml-1 !min-h-10 bg-white !px-4 font-bold text-[#1f4fd6] shadow-[0_6px_18px_rgb(4_10_30/0.35)] hover:shadow-[0_0_0_2px_var(--wn-cyan),0_8px_24px_rgb(34_211_238/0.4)]">
                <TakeIcon size={17} /> Dispatch
              </button>
              <div className="ml-1">
                <Menu label="Account" button={<span className="flex items-center gap-2 pr-2"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} /><span className="hidden max-w-[120px] truncate text-[13px] font-semibold text-white 2xl:block">{viewer.displayName}</span></span>} buttonClassName="flex h-10 items-center rounded-[10px] pl-1 hover:bg-white/15" items={account} />
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn !min-h-10 !px-3 !text-[13px] font-semibold text-white hover:bg-white/15">Log in</Link>
              <Link href="/signup" className="btn !min-h-10 bg-white !px-4 !text-[13px] font-bold text-[#1f4fd6] shadow-[0_6px_18px_rgb(4_10_30/0.35)] hover:shadow-[0_0_0_2px_var(--wn-cyan)]">Join</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
