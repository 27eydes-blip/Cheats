"use client";
import { useSyncExternalStore } from "react";

export type DeviceKind = "phone" | "tablet" | "desktop";

/**
 * Which layout to tune for. Phones get the big camera button and swipe
 * reviews; tablets (iPad + Pencil) get writing and markup; laptops get the
 * full dashboard. Returns null until mounted (server render can't know).
 */
function detect(): DeviceKind {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const short = Math.min(screen.width, screen.height);
  // iPadOS reports itself as a Mac; touch points give it away.
  const iPad = /iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iPad) return "tablet";
  if (coarse && short < 600) return "phone";
  if (coarse) return "tablet";
  return window.innerWidth < 640 ? "phone" : "desktop";
}

let cached: DeviceKind | null = null;
function snapshot() {
  cached ??= detect();
  return cached;
}
function subscribe(cb: () => void) {
  const onResize = () => {
    const next = detect();
    if (next !== cached) {
      cached = next;
      cb();
    }
  };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

export function useDevice(): DeviceKind | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
