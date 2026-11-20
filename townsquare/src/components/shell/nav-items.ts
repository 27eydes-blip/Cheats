import { BellIcon, BookmarkIcon, CommunityIcon, HashIcon, HomeIcon, LiveIcon, NewsIcon, SettingsIcon, ShieldIcon, UserIcon } from "../icons";

export function navItems(viewer: { handle: string; isAdmin: boolean } | null) {
  return [
    { href: "/", label: "Home", icon: HomeIcon, key: "home" },
    { href: "/explore", label: "Explore", icon: HashIcon, key: "explore" },
    { href: "/news", label: "News", icon: NewsIcon, key: "news" },
    { href: "/communities", label: "Communities", icon: CommunityIcon, key: "communities" },
    { href: "/live", label: "Live", icon: LiveIcon, key: "live" },
    ...(viewer
      ? [
          { href: "/notifications", label: "Notifications", icon: BellIcon, key: "notifications" },
          { href: "/bookmarks", label: "Bookmarks", icon: BookmarkIcon, key: "bookmarks" },
          { href: `/u/${viewer.handle}`, label: "Profile", icon: UserIcon, key: "profile" },
          { href: "/settings", label: "Settings", icon: SettingsIcon, key: "settings" },
          ...(viewer.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldIcon, key: "admin" }] : []),
        ]
      : []),
  ];
}

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/news") return path === "/news" || path.startsWith("/news/");
  if (href === "/communities") return path.startsWith("/communities") || path.startsWith("/c/");
  return path === href || path.startsWith(`${href}/`);
}
