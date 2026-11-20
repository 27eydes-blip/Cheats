"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const standalone = () => typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
const buzz = (ms = 8) => navigator.vibrate?.(ms);

/**
 * App-like gestures for the installed (home-screen) app, where the browser's own
 * gestures are missing: pull down at the top to refresh, swipe in from the left
 * edge to go back. In a normal browser tab the browser handles both.
 */
export function PhoneGestures() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [back, setBack] = useState(0);
  const [busy, setBusy] = useState(false);
  const g = useRef<{ x: number; y: number; mode: "pull" | "back" | null }>({ x: 0, y: 0, mode: null });

  useEffect(() => {
    if (!standalone()) return;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      // Only pull-to-refresh when nothing under the finger is scrolled down (the phone deck scrolls itself).
      let el = e.target as HTMLElement | null;
      let scrolled = false;
      while (el && el !== document.body) { if (el.scrollTop > 0) { scrolled = true; break; } el = el.parentElement; }
      const inScroller = scrolled || !!(e.target as Element).closest?.("[data-no-ptr], dialog[open], [role=dialog]");
      g.current = { x: t.clientX, y: t.clientY, mode: t.clientX < 24 && history.length > 1 ? "back" : window.scrollY <= 0 && !inScroller ? "pull" : null };
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - g.current.x;
      const dy = t.clientY - g.current.y;
      if (g.current.mode === "pull") {
        if (dy <= 0 || Math.abs(dx) > dy) return setPull(0);
        setPull((p) => { const n = Math.min(120, dy * 0.5); if (p < 70 && n >= 70) buzz(); return n; });
      } else if (g.current.mode === "back") {
        if (dx <= 0) return setBack(0);
        setBack((b) => { const n = Math.min(160, dx); if (b < 90 && n >= 90) buzz(); return n; });
      }
    };
    const end = () => {
      if (g.current.mode === "pull") {
        setPull((p) => {
          if (p >= 70) {
            setBusy(true);
            router.refresh();
            setTimeout(() => setBusy(false), 900);
          }
          return 0;
        });
      } else if (g.current.mode === "back") {
        setBack((b) => { if (b >= 90) router.back(); return 0; });
      }
      g.current.mode = null;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [router]);

  return (
    <>
      {(pull > 0 || busy) && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[80] flex justify-center" style={{ transform: `translateY(${busy ? 56 : pull * 0.8}px)` }}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-[#e3c773] shadow-[0_4px_16px_rgb(11_31_75/0.35)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={busy ? "animate-spin" : ""} style={busy ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / 70) }}>
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
            </svg>
          </span>
        </div>
      )}
      {back > 0 && (
        <div aria-hidden="true" className="pointer-events-none fixed top-1/2 left-0 z-[80] -translate-y-1/2" style={{ transform: `translate(${Math.min(28, back * 0.3) - 8}px, -50%)` }}>
          <span className={`grid h-10 w-10 place-items-center rounded-full shadow-lg transition-colors ${back >= 90 ? "bg-gold text-navy" : "bg-navy text-white"}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </span>
        </div>
      )}
    </>
  );
}

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * A one-time "Install the app" card on phones (dismissible). Uses the browser's
 * install prompt where available; on iPhone it shows the Share → Add to Home Screen steps.
 */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (standalone() || !matchMedia("(max-width: 767px)").matches) return;
    let seen = 0;
    try {
      if (localStorage.getItem("install-dismissed")) return;
      // Count visits (browser sessions), not page views.
      seen = Number(localStorage.getItem("visits") ?? 0);
      if (!sessionStorage.getItem("visit-counted")) {
        sessionStorage.setItem("visit-counted", "1");
        localStorage.setItem("visits", String(++seen));
      }
    } catch { return; }
    if (seen < 2) return; // don't greet first-time visitors with a prompt
    const onBip = (e: Event) => (e.preventDefault(), setEvt(e as BIP), setShow(true));
    window.addEventListener("beforeinstallprompt", onBip);
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent)) (setIos(true), setShow(true));
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);
  if (!show) return null;
  const close = () => { try { localStorage.setItem("install-dismissed", "1"); } catch {} setShow(false); };
  return (
    <div role="dialog" aria-label="Install the app" className="fixed inset-x-3 bottom-[calc(var(--tabbar-h,64px)+env(safe-area-inset-bottom)+12px)] z-40 flex items-center gap-3 rounded-[6px] bg-navy p-3 text-white shadow-[0_12px_40px_rgb(11_31_75/0.45),inset_0_-2px_0_var(--gold)] animate-stamp md:hidden">
      <img src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-[8px]" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <b className="block">Get the app</b>
        {ios ? <>Tap <span aria-label="Share">Share ⬆︎</span>, then <b>Add to Home Screen</b>.</> : "Full screen, faster, and works offline."}
      </p>
      {evt && <button type="button" onClick={async () => { await evt.prompt(); close(); }} className="h-9 rounded-[4px] bg-gold px-3 text-[13px] font-bold text-navy">Install</button>}
      <button type="button" onClick={close} aria-label="Dismiss" className="grid h-9 w-9 place-items-center rounded-[4px] text-white/70 hover:bg-white/10">✕</button>
    </div>
  );
}
