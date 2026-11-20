"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "../ui/Avatar";
import { LogoMark, Wordmark } from "../ui/Logo";
import { APP_NAME } from "@/config";
import { Menu } from "../ui/Menu";
import { EditionIcon, InboxIcon, KeyboardIcon, LogoutIcon, MonitorIcon, MoonIcon, RundownIcon, SearchIcon, SettingsIcon, ShieldIcon, SunIcon, TakeIcon, UserIcon } from "../icons";
import { useComposer, usePalette, useRundown, useShortcutsHelp, useViewer } from "../providers";
import { applyTheme } from "./ThemeToggle";

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="mono absolute -top-0.5 -right-0.5 min-w-[16px] rounded-full bg-live-bg px-[4px] ring-2 ring-[var(--masthead)] text-center text-[9.5px] leading-[15px] font-bold text-white">{n > 99 ? "99+" : n}</span>;
}

/** Electric-blue header bar: logo, section links, search, Newsdesk, Take it, account. */
export function Masthead({ unread }: { unread: number }) {
  const viewer = useViewer();
  const router = useRouter();
  const openComposer = useComposer();
  const openSearch = usePalette();
  const openRundown = useRundown();
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
    <header className="relative z-40 bg-[var(--masthead)] text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_10px_30px_-12px_rgb(47_107_255/0.8)]">
      {/* light sweep across the bar */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent motion-safe:animate-[sweep_7s_ease-in-out_infinite]" />
      </div>
      <div className="relative mx-auto flex h-[var(--header-h)] max-w-[1320px] items-center gap-3 px-3 lg:h-[68px] lg:px-8">
        <Link href="/" aria-label={`${APP_NAME} front page`} className="group flex shrink-0 items-center gap-2.5">
          <LogoMark size={34} className="rounded-[9px] shadow-[0_0_0_1.5px_rgb(255_255_255/0.55),0_6px_18px_rgb(4_10_30/0.45)] transition-transform duration-300 group-hover:rotate-[-8deg] lg:size-[40px]" />
          <span className="hidden sm:inline-flex"><Wordmark size="md" /></span>
          <span className="sm:hidden"><Wordmark size="sm" short /></span>
        </Link>

        <nav aria-label="Sections" className="ml-4 hidden items-center gap-1 xl:flex">
          {[["/briefing", "Morning Edition"], ["/markets", "Markets"], ["/live", "Live Studio"], ["/explore", "Trending"]].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-[8px] px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-white/15">{label}</Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={openSearch} className="hidden h-10 items-center gap-2 rounded-[10px] bg-[#070b14]/25 px-3 text-[13px] text-white ring-1 ring-white/25 transition-all hover:bg-[#070b14]/40 hover:ring-white/60 lg:flex">
            <SearchIcon size={17} /> Search <kbd className="mono ml-4 rounded-[5px] bg-white/15 px-1.5 text-[10.5px]">⌘K</kbd>
          </button>
          <button type="button" onClick={openSearch} className={`${icon} lg:hidden`} aria-label="Search"><SearchIcon size={20} /></button>
          {viewer ? (
            <>
              <button type="button" onClick={openRundown} className={`${icon} hidden lg:inline-flex`} aria-label="Rundown" title="Rundown"><RundownIcon size={20} /></button>
              <Link href="/notifications" className={icon} aria-label={`Newsdesk${unread ? `, ${unread} new` : ""}`} title="Newsdesk">
                <InboxIcon size={20} />
                <Badge n={unread} />
              </Link>
              <button type="button" onClick={() => openComposer()} className="btn ml-1 hidden !min-h-10 bg-white !px-4 font-bold text-[#1f4fd6] shadow-[0_6px_18px_rgb(4_10_30/0.35)] hover:shadow-[0_0_0_2px_var(--wn-cyan),0_8px_24px_rgb(34_211_238/0.4)] lg:inline-flex">
                <TakeIcon size={17} /> Take it
              </button>
              <div className="ml-1 hidden lg:block">
                <Menu label="Account" button={<span className="flex items-center gap-2 pr-2"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} /><span className="hidden max-w-[120px] truncate text-[13px] font-semibold text-white 2xl:block">{viewer.displayName}</span></span>} buttonClassName="flex h-10 items-center rounded-[10px] pl-1 hover:bg-white/15" items={account} />
              </div>
              <Link href={`/u/${viewer.handle}`} className="ml-1 inline-flex h-11 w-11 items-center justify-center lg:hidden" aria-label="Your byline"><Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={30} /></Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn !min-h-10 !px-2.5 !text-[13px] font-semibold text-white hover:bg-white/15 sm:!px-3">Log in</Link>
              <Link href="/signup" className="btn !min-h-10 bg-white !px-3 sm:!px-4 !text-[13px] font-bold text-[#1f4fd6] shadow-[0_6px_18px_rgb(4_10_30/0.35)] hover:shadow-[0_0_0_2px_var(--wn-cyan)]">Join</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
