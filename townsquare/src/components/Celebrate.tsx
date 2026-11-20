"use client";

import { useEffect, useRef, useState } from "react";
import type { Earned } from "@/lib/achievements";

type Detail = { kind: "achievement" | "first-post" | "follow" | "follower" | "milestone"; earned?: Earned[]; text?: string };
const EVENT = "wn:celebrate";

/** Fire a celebration from anywhere on the client. */
export function celebrate(d: Detail) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: d }));
}

/**
 * Confetti and glow for first posts, milestones and new followers. A short
 * canvas burst (≈1.4s) plus a glowing badge card; under reduced motion only
 * the card appears.
 */
export function Celebrate() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [card, setCard] = useState<{ title: string; text: string; emoji: string; id: number } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      const big = d.kind === "achievement" || d.kind === "first-post" || d.kind === "milestone";
      const first = d.earned?.[0];
      if (first) setCard({ title: first.label, text: first.text, emoji: first.emoji, id: Date.now() });
      else if (d.kind === "follower" && d.text) setCard({ title: "New follower", text: d.text, emoji: "🤝", id: Date.now() });
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) burst(canvas.current, big || !!first ? 140 : 40);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!card) return;
    const t = setTimeout(() => setCard(null), 3600);
    return () => clearTimeout(t);
  }, [card]);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[95] h-full w-full" />
      {card && (
        <div role="status" key={card.id} className="fixed top-24 left-1/2 z-[96] w-[min(92vw,380px)] -translate-x-1/2 animate-stamp">
          <div className="glass-strong flex items-center gap-3 rounded-[18px] p-3.5 shadow-3 ring-1 ring-[var(--wn-glass-border-hot)]" style={{ animation: "glow-pulse 1.4s ease-out 2" }}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(135deg,var(--wn-blue),var(--wn-cyan))] text-[26px]">{card.emoji}</span>
            <span className="min-w-0">
              <span className="block text-[11px] font-extrabold tracking-[0.14em] text-[var(--wn-cyan-ink)] uppercase">Unlocked</span>
              <span className="block font-display text-[20px] leading-tight font-extrabold">{card.title}</span>
              <span className="block truncate text-[13px] text-ink-2">{card.text}</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

const COLORS = ["#2f6bff", "#22d3ee", "#ffffff", "#7fa3ff", "#67e8f9", "#bcd0ff"];
function burst(c: HTMLCanvasElement | null, n: number) {
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const ox = innerWidth / 2;
  const oy = innerHeight * 0.32;
  const parts = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 7;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[(Math.random() * COLORS.length) | 0], life: 1 };
  });
  const startT = performance.now();
  const frame = (t: number) => {
    const k = (t - startT) / 1400;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.25;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  requestAnimationFrame(frame);
}
