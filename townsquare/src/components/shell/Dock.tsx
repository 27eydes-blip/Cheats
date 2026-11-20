"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DeskIcon, EditionIcon, RundownIcon, StudioIcon, TakeIcon } from "../icons";
import { useComposer, useRundown, useViewer } from "../providers";

/**
 * Phone dock: a slim navy bar with Take it in its own center slot, so the
 * compose button is part of the layout and never covers content.
 */
export function Dock({ liveCount }: { liveCount: number }) {
  const path = usePathname();
  const viewer = useViewer();
  const openComposer = useComposer();
  const openRundown = useRundown();
  if (/^\/(login|signup|welcome)/.test(path)) return null;
  const item = (on: boolean) => `flex h-full flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-[0.08em] uppercase ${on ? "text-gold" : "text-white/70"}`;
  return (
    <nav aria-label="Dock" className="fixed inset-x-0 bottom-0 z-30 bg-navy lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div aria-hidden="true" className="h-[2px] bg-gold" />
      <ul className="grid h-[var(--dock-h)] grid-cols-5">
        <li><Link href="/" aria-current={path === "/" ? "page" : undefined} className={item(path === "/")}><EditionIcon size={21} />Front</Link></li>
        <li>
          {viewer ? (
            <button type="button" onClick={openRundown} className={`${item(path === "/rundown")} w-full`}><RundownIcon size={21} />Rundown</button>
          ) : (
            <Link href="/rundown" className={item(false)}><RundownIcon size={21} />Rundown</Link>
          )}
        </li>
        <li className="flex items-center justify-center">
          <button type="button" onClick={() => openComposer()} aria-label="Take it: write a take" className="flex h-[46px] w-[58px] flex-col items-center justify-center gap-0.5 rounded-[4px] bg-gold text-navy transition-transform active:translate-y-px">
            <TakeIcon size={20} strokeWidth={1.9} />
            <span className="text-[9.5px] font-black tracking-[0.1em] uppercase">Take it</span>
          </button>
        </li>
        <li>
          <Link href="/live" aria-current={path.startsWith("/live") ? "page" : undefined} className={item(path.startsWith("/live"))}>
            <span className="relative"><StudioIcon size={21} />{liveCount > 0 && <span className="absolute -top-0.5 -right-1 h-2 w-2 animate-live rounded-full bg-[#ff4d5e]" />}</span>Live
          </Link>
        </li>
        <li><Link href="/communities" aria-current={path.startsWith("/c") ? "page" : undefined} className={item(path.startsWith("/communities") || path.startsWith("/c/"))}><DeskIcon size={21} />Desks</Link></li>
      </ul>
    </nav>
  );
}
