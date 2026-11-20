"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackIcon } from "./icons";

/** Sticky page title; on sub-pages shows a back button. */
export function PageHeader({ title, subtitle, back, children }: { title: string; subtitle?: string; back?: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="sticky top-14 z-20 border-b border-line bg-bg/90 backdrop-blur sm:top-0">
      <div className="flex min-h-14 items-center gap-3 px-4">
        {back && (
          <button type="button" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} className="btn-ghost -ml-2 min-w-11 px-0" aria-label="Back">
            <BackIcon />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div role="tablist" className="flex">
      {tabs.map((t) => (
        <Link
          key={t.key}
          scroll={false}
          href={t.href}
          role="tab"
          aria-selected={t.key === active}
          className={`relative flex min-h-12 flex-1 items-center justify-center text-[15px] hover:bg-surface ${t.key === active ? "font-bold" : "text-muted"}`}
        >
          {t.label}
          {t.key === active && <span className="absolute bottom-0 h-1 w-14 rounded-full bg-accent" />}
        </Link>
      ))}
    </div>
  );
}
