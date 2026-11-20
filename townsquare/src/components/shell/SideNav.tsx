"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "../ui/Avatar";
import { Logo, LogoMark } from "../ui/Logo";
import { Menu } from "../ui/Menu";
import { KeyboardIcon, LogoutIcon, MonitorIcon, MoonIcon, MoreIcon, PlusIcon, SearchIcon, SettingsIcon, SunIcon } from "../icons";
import { useComposer, usePalette, useShortcutsHelp, useViewer } from "../providers";
import { applyTheme, ThemeToggle } from "./ThemeToggle";
import { isActive, navItems } from "./nav-items";

/** Desktop/tablet left navigation: an icon rail on tablets, full labels from 1280px. */
export function SideNav({ unread, liveCount }: { unread: number; liveCount: number }) {
  const viewer = useViewer();
  const path = usePathname();
  const router = useRouter();
  const openComposer = useComposer();
  const openPalette = usePalette();
  const openShortcuts = useShortcutsHelp();
  const items = navItems(viewer);

  return (
    <nav aria-label="Main" className="sticky top-0 flex h-[100dvh] flex-col items-center py-4 xl:items-stretch xl:px-3">
      <div className="mb-5 xl:px-2">
        <span className="xl:hidden"><Link href="/" aria-label="Home"><LogoMark size={36} /></Link></span>
        <span className="hidden xl:block"><Logo /></span>
      </div>
      <button
        type="button"
        onClick={openPalette}
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] text-ink-3 ring-1 ring-line transition-colors hover:text-ink-1 xl:w-full xl:justify-start xl:gap-2.5 xl:px-3"
        aria-label="Search and commands (Ctrl+K)"
      >
        <SearchIcon size={18} />
        <span className="hidden flex-1 text-left text-[14px] xl:inline">Search</span>
        <kbd className="hidden rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-ink-3 xl:inline">⌘K</kbd>
      </button>
      <ul className="flex flex-col gap-0.5 xl:w-full">
        {items.map(({ href, label, icon: Icon, key }) => {
          const on = isActive(path, href);
          const badge = key === "notifications" ? unread : 0;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                aria-label={badge ? `${label}, ${badge} unread` : label}
                title={label}
                className={`group relative flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] transition-all duration-200 xl:w-full xl:justify-start xl:gap-3.5 xl:px-3 ${
                  on ? "bg-surface text-ink-1 shadow-1 ring-1 ring-line" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1"
                }`}
              >
                {on && <span aria-hidden="true" className="absolute top-2.5 bottom-2.5 -left-3 w-1 rounded-r-full bg-accent-grad shadow-glow xl:-left-3" />}
                <span className="relative">
                  <Icon size={22} strokeWidth={on ? 2.3 : 1.8} className={on ? "text-accent" : ""} />
                  {badge > 0 && (
                    <span className="num absolute -top-1.5 -right-2 min-w-[17px] rounded-full bg-breaking px-1 text-center text-[10px] leading-[17px] font-bold text-white ring-2 ring-canvas">{badge > 99 ? "99+" : badge}</span>
                  )}
                  {key === "live" && liveCount > 0 && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 animate-live rounded-full bg-live ring-2 ring-canvas" />}
                </span>
                <span className={`hidden text-[15.5px] xl:inline ${on ? "font-semibold" : "font-medium"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {viewer ? (
        <>
          <button type="button" className="btn-primary mt-4 !h-12 !w-12 !px-0 xl:!w-full" onClick={() => openComposer()} aria-label="New post">
            <PlusIcon size={22} />
            <span className="hidden xl:inline">New post</span>
            <kbd className="ml-auto hidden rounded-md bg-white/20 px-1.5 text-[11px] font-medium xl:inline">N</kbd>
          </button>
          <div className="mt-auto flex w-full items-center gap-2 rounded-[var(--r-md)] p-1.5 xl:hover:bg-surface-2">
            <Link href={`/u/${viewer.handle}`} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="Your profile">
              <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={38} />
              <span className="hidden min-w-0 xl:block">
                <span className="block truncate text-[14px] font-semibold">{viewer.displayName}</span>
                <span className="block truncate text-[12.5px] text-ink-3">@{viewer.handle}</span>
              </span>
            </Link>
            <span className="hidden xl:block">
              <Menu
                label="Account menu"
                align="left"
                button={<MoreIcon size={18} />}
                items={[
                  { label: "Settings", icon: <SettingsIcon size={18} />, onSelect: () => router.push("/settings") },
                  { label: "Keyboard shortcuts", icon: <KeyboardIcon size={18} />, onSelect: openShortcuts, hint: "?" },
                  { label: "Dark mode", icon: <MoonIcon size={18} />, onSelect: () => applyTheme("dark") },
                  { label: "Light mode", icon: <SunIcon size={18} />, onSelect: () => applyTheme("light") },
                  { label: "Match device", icon: <MonitorIcon size={18} />, onSelect: () => applyTheme("system") },
                  "divider",
                  { label: "Log out", icon: <LogoutIcon size={18} />, onSelect: () => logoutAction() },
                ]}
              />
            </span>
          </div>
        </>
      ) : (
        <div className="mt-6 flex flex-col gap-2 xl:w-full">
          <Link href="/signup" className="btn-primary !px-3" aria-label="Create account"><span className="xl:hidden"><PlusIcon size={20} /></span><span className="hidden xl:inline">Create account</span></Link>
          <Link href="/login" className="btn-outline hidden xl:inline-flex">Log in</Link>
          <div className="mt-2 hidden xl:block"><ThemeToggle compact /></div>
        </div>
      )}
    </nav>
  );
}
