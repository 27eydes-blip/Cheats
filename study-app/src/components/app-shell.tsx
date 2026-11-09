"use client";
import clsx from "clsx";
import { BookOpen, Camera, Home, LogOut, Moon, PenTool, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { APP_CONFIG } from "@/config/app";
import { useDevice } from "@/hooks/use-device";
import { useAuth } from "./auth-provider";
import { useTheme } from "./theme-provider";
import { Spinner } from "./ui/card";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/capture", label: "Snap", icon: Camera },
  { href: "/ink", label: "Write", icon: PenTool, tabletOnly: true },
  { href: "/library", label: "Library", icon: BookOpen },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-card">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 19V6a2 2 0 0 1 2-2h12v13H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12" />
          <path d="m9 10 2 2 4-4" />
        </svg>
      </span>
      {APP_CONFIG.shortName}
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-10 items-center justify-center rounded-xl hover:bg-primary-soft"
    >
      {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
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

/**
 * Laptop: left sidebar. Phone/iPad: bottom tab bar sized for thumbs.
 * "Write" only appears where there's a pen (iPad).
 */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const path = usePathname();
  const device = useDevice();
  const { user, signOut } = useAuth();
  const items = NAV.filter((n) => !n.tabletOnly || device === "tablet");
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line bg-elev p-4 md:flex">
        <Link href="/" className="mb-6 px-2 text-lg">
          <Logo />
        </Link>
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={clsx(
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 font-medium transition",
              active(n.href) ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft hover:text-fg",
            )}
          >
            <n.icon className="size-5" />
            {n.label}
          </Link>
        ))}
        <div className="mt-auto flex items-center gap-1">
          <ThemeToggle />
          {user && (
            <button type="button" onClick={signOut} aria-label="Sign out" className="flex size-10 items-center justify-center rounded-xl hover:bg-primary-soft">
              <LogOut className="size-5" />
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center">
            <ThemeToggle />
            {user && (
              <button type="button" onClick={signOut} aria-label="Sign out" className="flex size-10 items-center justify-center rounded-xl hover:bg-primary-soft">
                <LogOut className="size-5" />
              </button>
            )}
          </div>
        </header>
        <main className={clsx("mx-auto w-full flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8", wide ? "max-w-7xl" : "max-w-5xl")}>
          {children}
        </main>
      </div>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-elev/95 backdrop-blur md:hidden" aria-label="Main">
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 pt-2 text-[11px] font-semibold",
              active(n.href) ? "text-primary" : "text-muted",
            )}
          >
            <n.icon className="size-6" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
