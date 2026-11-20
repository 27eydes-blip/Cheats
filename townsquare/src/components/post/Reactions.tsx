"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reactAction } from "@/actions/social";
import { REACTIONS, type ReactionKind } from "@/lib/reactions-meta";
import { SparkIcon } from "../icons";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { useToast, useViewer } from "../providers";
import { celebrate } from "../Celebrate";
import { FloatingPortal, useFloating } from "../ui/useFloating";

type Counts = Record<ReactionKind, number>;

/**
 * Boost: tap for a quick 🔥 (tap again to undo). Hold (or hover, right-click,
 * or press Up) for the five reactions; picking one pops it with a small burst.
 * One reaction per person per dispatch.
 */
export function Reactions({ postId, counts: initialCounts, mine: initialMine }: { postId: string; counts: Counts; mine: ReactionKind | null }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [counts, setCounts] = useState(initialCounts);
  const [mine, setMine] = useState(initialMine);
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [, start] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const hoverT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const clearPress = () => {
    if (press.current) clearTimeout(press.current);
    if (hoverT.current) clearTimeout(hoverT.current);
  };
  const btn = useRef<HTMLButtonElement>(null);
  const pos = useFloating(btn, open, { w: 268, h: 64 });
  useEffect(() => setCounts(initialCounts), [initialCounts]);
  useEffect(() => setMine(initialMine), [initialMine]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !wrap.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[aria-label=Reactions][role=menu]") && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", close), document.removeEventListener("keydown", esc));
  }, [open]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = REACTIONS.filter((r) => counts[r.key] > 0).sort((a, b) => counts[b.key] - counts[a.key]).slice(0, 2);
  const mineMeta = REACTIONS.find((r) => r.key === mine);

  const pick = (k: ReactionKind) => {
    if (!viewer) return router.push("/login");
    setOpen(false);
    const prev = { counts, mine };
    const next = mine === k ? null : k;
    const c = { ...counts };
    if (mine) c[mine] = Math.max(0, c[mine] - 1);
    if (next) c[next] += 1;
    setCounts(c);
    setMine(next);
    if (next) (setBurst((b) => b + 1), navigator.vibrate?.(8));
    start(async () => {
      const r = await reactAction(postId, k);
      if (!r.ok) return (setCounts(prev.counts), setMine(prev.mine), toast(r.error, "error"));
      setCounts(r.data.counts);
      setMine(r.data.kind);
      if (r.data.earned.length) celebrate({ kind: "achievement", earned: r.data.earned });
    });
  };

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        type="button"
        data-action="boost"
        onPointerDown={(e) => {
          held.current = false;
          if (e.pointerType === "mouse" && e.button !== 0) return;
          press.current = setTimeout(() => ((held.current = true), navigator.vibrate?.(10), setOpen(true)), 420);
        }}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        onPointerEnter={(e) => e.pointerType === "mouse" && (hoverT.current = setTimeout(() => setOpen(true), 550))}
        onContextMenu={(e) => (e.preventDefault(), setOpen(true))}
        onKeyDown={(e) => (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) && (e.preventDefault(), setOpen(true))}
        onClick={(e) => {
          e.stopPropagation();
          clearPress();
          if (held.current) return void (held.current = false);
          if (open) return setOpen(false);
          pick(mine ?? "fire"); // tap = quick Boost (or undo)
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-pressed={!!mine}
        aria-label={`${mine ? `Boosted with ${mineMeta?.label}. Tap to remove` : "Boost"}${total ? `, ${total} reactions` : ""}. Hold, or press Up, for more reactions`}
        title="Boost (hold for reactions)"
        className={`relative inline-flex h-11 min-w-11 select-none items-center justify-center gap-1.5 rounded-[12px] px-2 text-[12.5px] font-semibold transition-all duration-150 active:scale-90 [-webkit-touch-callout:none] ${mine ? "amber-ink bg-[rgb(245_158_11/0.12)]" : "text-ink-2 hover:bg-[rgb(245_158_11/0.1)]"}`}
      >
        <span key={`${mine}-${burst}`} className={mine ? "animate-pop text-[17px] leading-none" : "leading-none"}>{mineMeta ? mineMeta.emoji : <SparkIcon size={19} />}</span>
        {!mine && top.length > 0 && <span aria-hidden="true" className="-ml-0.5 flex text-[13px] leading-none">{top.map((r) => <span key={r.key}>{r.emoji}</span>)}</span>}
        <span className="hidden min-[420px]:inline">{mine ? mineMeta?.label === "Mind Blown" ? "Wow" : mineMeta?.label : "Boost"}</span>
        <AnimatedNumber value={total} hideZero className="mono text-[12px]" />
        {burst > 0 && <Burst key={burst} />}
      </button>
      {open && (
        <FloatingPortal anchor={btn}>
        <div role="menu" aria-label="Reactions" style={pos} className="glass-strong flex animate-scale-in justify-between gap-0.5 rounded-[16px] p-1.5 shadow-3 ring-1 ring-[var(--wn-glass-border)]" onClick={(e) => e.stopPropagation()}>
          {REACTIONS.map((r, i) => (
            <button
              key={r.key}
              type="button"
              role="menuitemradio"
              aria-checked={mine === r.key}
              onClick={() => pick(r.key)}
              title={r.label}
              className={`group/r flex h-12 w-12 flex-col items-center justify-center rounded-[12px] transition-transform duration-150 hover:-translate-y-1 hover:scale-110 ${mine === r.key ? "bg-white/10 ring-1 ring-[#fbbf24]/60" : "hover:bg-white/5"}`}
              style={{ animation: `rise 260ms var(--ease-spring) ${i * 30}ms both` }}
            >
              <span className="text-[24px] leading-none">{r.emoji}</span>
              <span className="mt-0.5 text-[9px] font-bold tracking-[0.04em] text-ink-2 uppercase">{r.key === "mindblown" ? "Wow" : r.label}</span>
            </button>
          ))}
        </div>
        </FloatingPortal>
      )}
    </div>
  );
}

/** A tiny ring of sparks that bursts from the button (CSS only; skipped under reduced motion). */
function Burst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full" style={{ background: i % 2 ? "#fbbf24" : "#22d3ee", animation: `spark 520ms var(--ease-out) forwards`, ["--a" as string]: `${i * 45}deg` }} />
      ))}
    </span>
  );
}
