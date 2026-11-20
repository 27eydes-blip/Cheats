"use client";

import { useEffect, useRef } from "react";
import type { LiveEvent } from "@/lib/realtime";

/**
 * One shared EventSource per tab for /api/stream. Components subscribe with
 * useLiveEvents(); the connection opens on first use and reconnects on its own.
 */
type Handler = (e: LiveEvent) => void;
const handlers = new Set<Handler>();
let es: EventSource | null = null;

function connect() {
  if (es || typeof window === "undefined" || !("EventSource" in window)) return;
  es = new EventSource("/api/stream");
  es.onmessage = (m) => {
    let e: LiveEvent;
    try { e = JSON.parse(m.data); } catch { return; }
    handlers.forEach((h) => h(e));
  };
}

export function useLiveEvents(handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h: Handler = (e) => ref.current(e);
    handlers.add(h);
    connect();
    return () => { handlers.delete(h); };
  }, []);
}
