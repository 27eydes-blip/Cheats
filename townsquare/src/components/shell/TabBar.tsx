"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TakeIcon } from "../icons";
import { useComposer } from "../providers";
import { activeTab, TABS } from "./menu";
import { MenuGlyph } from "./MenuIcons";

/**
 * Phone bottom bar: Home, Discover, Markets, Alerts, Messages. A glowing
 * indicator slides to the active tab; Alerts and Messages carry unread badges.
 * The floating compose button sits above it.
 */
export function TabBar({ unread, unreadMessages }: { unread: number; unreadMessages: number }) {
  const path = usePathname() ?? "/";
  const openComposer = useComposer();
  if (/^\/(login|signup|welcome)/.test(path)) return null;
  const active = activeTab(path);
  const badge = (key: string) => (key === "alerts" ? unread : key === "messages" ? unreadMessages : 0);
  const showFab = !/^\/(messages|admin|settings|help|wallet)/.test(path);
  return (
    <>
      {showFab && (
        <button
          type="button"
          onClick={() => openComposer()}
          aria-label="Dispatch: write a dispatch"
          className="fab fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-[19px] bg-[var(--wn-blue-fill)] text-white ring-1 ring-[rgb(127_163_255/0.7)] transition-transform duration-150 active:scale-90 lg:hidden"
          style={{ bottom: "calc(var(--dock-h) + 16px + env(safe-area-inset-bottom))" }}
        >
          <TakeIcon size={24} strokeWidth={2} />
        </button>
      )}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--wn-glass-border)] bg-[var(--glass-strong)] backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
        <div className="relative">
          {/* sliding active indicator */}
          <span aria-hidden="true" className="absolute top-0 left-0 flex h-[3px] w-1/5 justify-center transition-transform duration-300 ease-[var(--ease-spring)] motion-reduce:transition-none" style={{ transform: `translateX(${Math.max(0, active) * 100}%)`, opacity: active < 0 ? 0 : 1 }}>
            <span className="h-full w-9 rounded-b-full bg-[var(--wn-cyan)] shadow-[0_0_12px_var(--wn-cyan)]" />
          </span>
          <ul className="grid h-[var(--dock-h)] grid-cols-5">
            {TABS.map((t, i) => {
              const on = i === active;
              const n = badge(t.key);
              return (
                <li key={t.key}>
                  <Link href={t.href} aria-current={on ? "page" : undefined} aria-label={n ? `${t.label}, ${n} new` : t.label} className={`group flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-bold tracking-[0.04em] transition-colors ${on ? "text-ink-1" : "text-ink-3"}`}>
                    <span className={`relative transition-transform duration-200 group-active:scale-90 ${on ? "-translate-y-px text-[var(--wn-blue-ink)]" : ""}`}>
                      <MenuGlyph name={t.icon} size={23} strong={on} />
                      {n > 0 && <span className="mono absolute -top-1.5 -right-2.5 min-w-[17px] rounded-full bg-live-bg px-1 text-center text-[10px] leading-[17px] font-bold text-white ring-2 ring-[var(--wn-panel-1)]">{n > 99 ? "99+" : n}</span>}
                    </span>
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
