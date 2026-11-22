/**
 * The side menu's destinations (shared by the phone drawer and the desktop
 * rail). Pure data so it's easy to test: no icons or React here.
 */
export type MenuIcon = "profile" | "vault" | "history" | "lists" | "rooms" | "groups" | "markets" | "creator" | "wallet" | "settings" | "help" | "rundown" | "edition" | "teams" | "control" | "home" | "discover" | "alerts" | "messages";
export type MenuEntry = { key: string; label: string; href: string; icon: MenuIcon; hint?: string; auth?: boolean };

export function menuItems(o: { handle: string | null; isAdmin: boolean; wallet: boolean }): { main: MenuEntry[]; more: MenuEntry[] } {
  const signedIn = !!o.handle;
  const main: MenuEntry[] = [
    { key: "profile", label: "Profile", href: signedIn ? `/u/${o.handle}` : "/login", icon: "profile", auth: true },
    { key: "vault", label: "Vault", href: "/bookmarks", icon: "vault", hint: "Saved dispatches", auth: true },
    { key: "history", label: "History", href: "/history", icon: "history", hint: "What you opened", auth: true },
    { key: "lists", label: "Lists", href: "/lists", icon: "lists", hint: "Your own feeds", auth: true },
    { key: "rooms", label: "Rooms", href: "/live", icon: "rooms", hint: "Live audio and chat" },
    { key: "groups", label: "Groups", href: "/communities", icon: "groups", hint: "Desks for every beat" },
    { key: "markets", label: "Markets", href: "/markets", icon: "markets" },
    { key: "creator", label: "Creator Hub", href: "/creator", icon: "creator", hint: "Your reach and top dispatches", auth: true },
    ...(o.wallet ? [{ key: "wallet", label: "Wallet", href: "/wallet", icon: "wallet", hint: "Coming soon", auth: true } satisfies MenuEntry] : []),
    { key: "settings", label: "Settings", href: "/settings", icon: "settings", auth: true },
    { key: "help", label: "Help", href: "/help", icon: "help" },
  ];
  const more: MenuEntry[] = [
    { key: "rundown", label: "Rundown", href: "/rundown", icon: "rundown", auth: true },
    { key: "edition", label: "Morning Edition", href: "/briefing", icon: "edition" },
    { key: "teams", label: "Teams", href: "/sports?view=teams", icon: "teams" },
    ...(o.isAdmin ? [{ key: "control", label: "Control Room", href: "/admin", icon: "control", auth: true } satisfies MenuEntry] : []),
  ];
  return signedIn ? { main, more } : { main: main.filter((m) => !m.auth), more: more.filter((m) => !m.auth) };
}

/** The five bottom tabs. */
export const TABS: MenuEntry[] = [
  { key: "home", label: "Home", href: "/", icon: "home" },
  { key: "discover", label: "Discover", href: "/explore", icon: "discover" },
  { key: "markets", label: "Markets", href: "/markets", icon: "markets" },
  { key: "alerts", label: "Alerts", href: "/notifications", icon: "alerts" },
  { key: "messages", label: "Messages", href: "/messages", icon: "messages" },
];

/** Which bottom tab a path belongs to (−1 = none). */
export function activeTab(path: string): number {
  if (path === "/") return 0;
  if (path.startsWith("/explore") || path.startsWith("/search")) return 1;
  if (path.startsWith("/markets")) return 2;
  if (path.startsWith("/notifications")) return 3;
  if (path.startsWith("/messages")) return 4;
  return -1;
}

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
