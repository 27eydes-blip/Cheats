"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/config";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "./Avatar";
import { BellIcon, BookmarkIcon, CommunityIcon, HashIcon, HomeIcon, LiveIcon, LogoutIcon, NewsIcon, PlusIcon, SearchIcon, SettingsIcon, ShieldIcon, UserIcon } from "./icons";
import { useComposer, useViewer } from "./providers";

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-black tracking-tight ${className}`} aria-label={`${APP_NAME} home`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-lg text-white">{APP_NAME[0]}</span>
      <span className="text-xl">{APP_NAME}</span>
    </Link>
  );
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-1.5 min-w-[18px] rounded-full bg-breaking px-1 text-center text-[11px] leading-[18px] font-bold text-white" aria-label={`${n} unread`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Desktop left sidebar. */
export function SideNav({ unread }: { unread: number }) {
  const viewer = useViewer();
  const active = useActive();
  const openComposer = useComposer();
  const items = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/explore", label: "Explore", icon: HashIcon },
    { href: "/news", label: "News", icon: NewsIcon },
    { href: "/communities", label: "Communities", icon: CommunityIcon },
    { href: "/live", label: "Live", icon: LiveIcon },
    ...(viewer
      ? [
          { href: "/notifications", label: "Notifications", icon: BellIcon, badge: unread },
          { href: "/bookmarks", label: "Bookmarks", icon: BookmarkIcon },
          { href: `/u/${viewer.handle}`, label: "Profile", icon: UserIcon },
          { href: "/settings", label: "Settings", icon: SettingsIcon },
          ...(viewer.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldIcon }] : []),
        ]
      : []),
  ];
  return (
    <nav aria-label="Main" className="sticky top-0 flex h-[100dvh] flex-col gap-1 py-3 pr-3">
      <Logo className="mb-3 px-3" />
      {items.map(({ href, label, icon: Icon, badge }) => {
        const on = active(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`flex min-h-12 items-center gap-4 rounded-full px-3 text-[18px] hover:bg-surface ${on ? "font-bold" : ""}`}>
            <span className="relative">
              <Icon size={24} strokeWidth={on ? 2.4 : 1.9} />
              {badge ? <Badge n={badge} /> : null}
            </span>
            <span className="hidden xl:inline">{label}</span>
          </Link>
        );
      })}
      {viewer ? (
        <>
          <button type="button" className="btn-primary mt-3 min-h-12 text-[17px]" onClick={() => openComposer()}>
            <PlusIcon className="xl:hidden" />
            <span className="hidden xl:inline">Post</span>
          </button>
          <div className="mt-auto flex items-center gap-2 rounded-full p-2">
            <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={40} />
            <div className="hidden min-w-0 flex-1 xl:block">
              <p className="truncate font-bold">{viewer.displayName}</p>
              <p className="truncate text-sm text-muted">@{viewer.handle}</p>
            </div>
            <form action={logoutAction}>
              <button className="btn-ghost min-w-11 px-0" aria-label="Log out" title="Log out">
                <LogoutIcon size={20} />
              </button>
            </form>
          </div>
        </>
      ) : (
        <div className="mt-4 hidden flex-col gap-2 xl:flex">
          <Link href="/signup" className="btn-primary">Create account</Link>
          <Link href="/login" className="btn-outline">Log in</Link>
        </div>
      )}
    </nav>
  );
}

/** Mobile top bar: logo, search, notifications. */
export function TopBar({ unread }: { unread: number }) {
  const viewer = useViewer();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur sm:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        <Link href="/search" className="btn-ghost min-w-11 px-0" aria-label="Search">
          <SearchIcon />
        </Link>
        {viewer ? (
          <Link href="/notifications" className="btn-ghost relative min-w-11 px-0" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <span className="relative">
              <BellIcon />
              <Badge n={unread} />
            </span>
          </Link>
        ) : (
          <Link href="/login" className="btn-primary min-h-9 px-3 text-sm">Log in</Link>
        )}
      </div>
    </header>
  );
}

/** Mobile bottom tabs + floating post button. */
export function BottomTabs() {
  const viewer = useViewer();
  const active = useActive();
  const openComposer = useComposer();
  const tabs = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/news", label: "News", icon: NewsIcon },
    { href: "/communities", label: "Communities", icon: CommunityIcon },
    { href: "/live", label: "Live", icon: LiveIcon },
    { href: viewer ? `/u/${viewer.handle}` : "/login", label: "Profile", icon: UserIcon },
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => openComposer()}
        aria-label="New post"
        className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl active:scale-95 sm:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <PlusIcon size={26} />
      </button>
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="grid grid-cols-5">
          {tabs.map(({ href, label, icon: Icon }) => {
            const on = active(href);
            return (
              <li key={label}>
                <Link href={href} aria-current={on ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-bold text-fg" : "text-muted"}`}>
                  <Icon size={24} strokeWidth={on ? 2.4 : 1.9} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
