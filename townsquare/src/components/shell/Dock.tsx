"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EditionIcon, RundownIcon, StudioIcon, TakeIcon, TrendIcon } from "../icons";
import { useComposer, useRundown, useViewer } from "../providers";

/**
 * Phone tab bar: dark glass, a cyan indicator over the active tab, and a raised
 * electric-blue Take it button in its own center slot.
 */
export function Dock({ liveCount }: { liveCount: number }) {
  const path = usePathname();
  const viewer = useViewer();
  const openComposer = useComposer();
  const openRundown = useRundown();
  if (/^\/(login|signup|welcome)/.test(path)) return null;
  const item = (on: boolean) =>
    `relative flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-bold tracking-[0.06em] uppercase transition-colors ${on ? "text-white" : "text-[var(--wn-text-3)] active:text-white"}`;
  const dot = (on: boolean) => <span aria-hidden="true" className={`absolute top-1 h-1 w-6 rounded-full bg-[var(--wn-cyan)] shadow-[0_0_10px_var(--wn-cyan)] transition-all duration-300 ${on ? "opacity-100" : "scale-x-0 opacity-0"}`} />;
  const markets = path.startsWith("/markets");
  const live = path.startsWith("/live");
  return (
    <nav aria-label="Dock" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--wn-glass-border)] bg-[rgb(7_11_20/0.86)] backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid h-[var(--dock-h)] grid-cols-5">
        <li><Link href="/" aria-current={path === "/" ? "page" : undefined} className={item(path === "/")}>{dot(path === "/")}<EditionIcon size={22} />Front</Link></li>
        <li><Link href="/markets" aria-current={markets ? "page" : undefined} className={item(markets)}>{dot(markets)}<TrendIcon size={22} />Markets</Link></li>
        <li className="flex items-center justify-center">
          <button type="button" onClick={() => openComposer()} aria-label="Dispatch: write a dispatch" className="-mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-[18px] bg-[var(--wn-blue-fill)] text-white shadow-[0_0_0_4px_var(--wn-bg),0_8px_24px_rgb(47_107_255/0.7)] ring-1 ring-[rgb(127_163_255/0.6)] transition-transform active:scale-95">
            <TakeIcon size={22} strokeWidth={2} />
            <span className="sr-only">Dispatch</span>
          </button>
        </li>
        <li>
          <Link href="/live" aria-current={live ? "page" : undefined} className={item(live)}>
            {dot(live)}
            <span className="relative"><StudioIcon size={22} />{liveCount > 0 && <span className="absolute -top-0.5 -right-1 h-2 w-2 animate-live rounded-full bg-[var(--wn-red)]" />}</span>Live
          </Link>
        </li>
        <li>
          {viewer ? (
            <button type="button" onClick={openRundown} className={`${item(path === "/rundown")} w-full`}>{dot(path === "/rundown")}<RundownIcon size={22} />Rundown</button>
          ) : (
            <Link href="/rundown" className={item(false)}><RundownIcon size={22} />Rundown</Link>
          )}
        </li>
      </ul>
    </nav>
  );
}
