"use client";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { APP_CONFIG } from "@/config/app";
import { useDevice } from "@/hooks/use-device";
import { useAuth } from "./auth-provider";
import { BrandMark, IconCamera, IconHome, IconLibrary, IconMoon, IconPencil, IconSignOut, IconSun } from "./icons";
import { useTheme } from "./theme-provider";
import { Spinner } from "./ui/card";

const NAV = [
  { href: "/", label: "Home", icon: IconHome },
  { href: "/capture", label: "Snap notes", short: "Snap", icon: IconCamera },
  { href: "/ink", label: "Write", icon: IconPencil, tabletOnly: true },
  { href: "/library", label: "Library", icon: IconLibrary },
];

export function Logo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]", className)}>
      <BrandMark size={size} />
      {APP_CONFIG.shortName}
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85, rotate: -15 }}
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={clsx("relative flex size-10 items-center justify-center overflow-hidden rounded-full text-fg-2 hover:bg-elev-2 hover:text-fg", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.18 }}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

/** Redirects to sign-in when there's no session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, user, router, path]);
  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}

function initials(name?: string | null) {
  return (name ?? "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

/**
 * Laptop: a quiet left sidebar. Phone and iPad: a glass header plus a floating
 * dock with a raised camera button in the middle (one tap to snap notes).
 */
export function AppShell({ children, wide, focus }: { children: ReactNode; wide?: boolean; focus?: boolean }) {
  const path = usePathname();
  const device = useDevice();
  const { user, signOut } = useAuth();
  const items = NAV.filter((n) => !n.tabletOnly || device === "tablet");
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  return (
    <div className="min-h-dvh lg:flex">
      {/* Laptop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-line px-4 pb-4 pt-6 lg:flex" style={{ viewTransitionName: "app-sidebar" }}>
        <Link href="/" className="mb-8 px-3">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                active(n.href) ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {active(n.href) && (
                <motion.span layoutId="nav-active" className="absolute inset-0 rounded-2xl bg-elev-2" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
              )}
              <n.icon className={clsx("relative", active(n.href) && "text-accent-ink")} />
              <span className="relative">{n.label}</span>
            </Link>
          ))}
        </nav>
        <Link
          href="/capture?camera=1"
          className="group relative mt-6 overflow-hidden rounded-3xl border border-line bg-elev p-4 transition hover:border-line-strong"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-accent opacity-20 blur-2xl transition group-hover:opacity-35" />
          <IconCamera className="mb-3 text-accent-ink" size={22} />
          <p className="text-sm font-semibold">Snap new notes</p>
          <p className="text-xs text-muted">Photo to quiz in seconds</p>
        </Link>
        <div className="mt-auto flex items-center gap-2 rounded-2xl px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-elev-2 text-xs font-bold text-fg-2">{initials(name)}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">{name}</span>
          <ThemeToggle />
          {user && (
            <button type="button" onClick={signOut} aria-label="Sign out" className="flex size-10 items-center justify-center rounded-full text-fg-2 hover:bg-elev-2 hover:text-fg">
              <IconSignOut />
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone / iPad header */}
        <header className="glass pt-safe sticky top-0 z-30 border-b border-line lg:hidden" style={{ viewTransitionName: "app-header" }}>
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-8">
            <Link href="/">
              <Logo size={28} />
            </Link>
            <div className="flex items-center">
              <ThemeToggle />
              {user && (
                <button type="button" onClick={signOut} aria-label="Sign out" className="flex size-10 items-center justify-center rounded-full text-fg-2 hover:bg-elev-2">
                  <IconSignOut />
                </button>
              )}
            </div>
          </div>
        </header>
        <main className={clsx("mx-auto w-full flex-1 px-4 pt-6 md:px-8 md:pt-10 lg:px-12 lg:pb-16", focus ? "pb-10" : "pb-36", wide ? "max-w-7xl" : "max-w-5xl")}>{children}</main>
      </div>

      {/* Phone / iPad floating dock (hidden in focused study modes) */}
      {!focus && (
      <nav
        aria-label="Main"
        className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 lg:hidden"
        style={{ viewTransitionName: "app-dock" }}
      >
        <div className="glass pointer-events-auto mb-3 flex items-center gap-1 rounded-full border border-line-strong p-1.5 shadow-lift">
          {items.map((n) => {
            const isCamera = n.href === "/capture";
            if (isCamera) {
              return (
                <Link key={n.href} href="/capture?camera=1" aria-label={n.label} className="mx-1">
                  <motion.span
                    whileTap={{ scale: 0.88 }}
                    className={clsx(
                      "flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-glow",
                      active(n.href) && "ring-4 ring-accent-soft",
                    )}
                  >
                    <IconCamera size={26} />
                  </motion.span>
                </Link>
              );
            }
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "relative flex h-12 min-w-[68px] flex-col items-center justify-center gap-0.5 rounded-full px-3 text-[10.5px] font-semibold transition-colors",
                  active(n.href) ? "text-fg" : "text-muted",
                )}
              >
                {active(n.href) && (
                  <motion.span layoutId="dock-active" className="absolute inset-0 rounded-full bg-elev-2" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                )}
                <n.icon size={21} className={clsx("relative", active(n.href) && "text-accent-ink")} />
                <span className="relative">{n.short ?? n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}
