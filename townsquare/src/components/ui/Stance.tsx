"use client";

import { useLiveEvents } from "../live";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Split, StanceTarget, StanceValue } from "@/lib/stance";
import { stanceAction } from "@/actions/stance";
import { AgreeIcon, ContextIcon, DisagreeIcon, QuestionIcon } from "../icons";
import { useToast, useViewer } from "../providers";

const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);

export type TakeStance = "agree" | "disagree" | "context" | "question";
const CHIP: Record<TakeStance, { label: string; cls: string; Icon: typeof AgreeIcon }> = {
  agree: { label: "Agrees", cls: "text-agree bg-agree/10 ring-agree/30", Icon: AgreeIcon },
  disagree: { label: "Disagrees", cls: "text-disagree bg-disagree/10 ring-disagree/30", Icon: DisagreeIcon },
  context: { label: "Context", cls: "text-gold-ink bg-gold-soft ring-gold/40", Icon: ContextIcon },
  question: { label: "Question", cls: "text-navy-ink bg-navy-soft ring-navy-ink/25", Icon: QuestionIcon },
};

/** The stance a Take's author took, as a small square-cornered label. */
export function StanceChip({ stance, size = "sm" }: { stance: TakeStance; size?: "sm" | "md" }) {
  const c = CHIP[stance];
  return (
    <span className={`inline-flex items-center gap-1 rounded-[3px] ring-1 ${c.cls} ${size === "md" ? "px-2 py-1 text-[11.5px]" : "px-1.5 py-[2px] text-[10.5px]"} font-bold tracking-[0.1em] uppercase`}>
      <c.Icon size={size === "md" ? 13 : 12} strokeWidth={2} />
      {c.label}
    </span>
  );
}

/** Just the bar: agree | unsure | disagree, widths animate on change. */
export function SplitBar({ split, height = 6, className = "" }: { split: Split; height?: number; className?: string }) {
  const [shown, setShown] = useState<Split | null>(null);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(split));
    return () => cancelAnimationFrame(t);
  }, [split]);
  const s = shown ?? { ...split, agree: 0, disagree: 0, unsure: 0 };
  const total = split.total || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  const ease = "width 700ms var(--ease-spring)";
  return (
    <div aria-hidden="true" className={`flex shrink-0 gap-[2px] overflow-hidden rounded-[2px] bg-paper-3 ${className || "w-full"}`} style={{ height }}>
      {split.total > 0 && (
        <>
          <span className="bg-agree" style={{ width: seg(s.agree), transition: ease }} />
          <span className="bg-unsure" style={{ width: seg(s.unsure), transition: ease }} />
          <span className="bg-disagree" style={{ width: seg(s.disagree), transition: ease }} />
        </>
      )}
    </div>
  );
}

/**
 * The stance meter that replaces likes. Shows the split and lets the reader
 * cast (or clear) their own stance, optimistically.
 *  - `compact`: one line, used on Take cards
 *  - `large`: headline numbers and big buttons, used on Story pages and the deck
 */
export function StanceMeter({ type, id, initial, variant = "compact", onChange }: { type: StanceTarget; id: string; initial: Split; variant?: "compact" | "large" | "tile"; onChange?: (s: Split) => void }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [split, setSplit] = useState(initial);
  const [, start] = useTransition();
  useEffect(() => setSplit(initial), [initial]);
  // Live: other readers' stances move the meter in real time (your own pick stays yours).
  useLiveEvents((e) => {
    if (e.type === "stance" && e.target === type && e.id === id) setSplit((s) => ({ ...s, agree: e.agree, disagree: e.disagree, unsure: e.unsure, total: e.total }));
  });

  const cast = (value: StanceValue) => {
    if (!viewer) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
    const next = split.mine === value ? null : value;
    const prev = split;
    const opt = { ...split };
    if (split.mine) (opt[split.mine] = Math.max(0, opt[split.mine] - 1), (opt.total -= 1));
    if (next) (opt[next] += 1, (opt.total += 1));
    opt.mine = next;
    setSplit(opt);
    onChange?.(opt);
    if (typeof navigator !== "undefined" && next) navigator.vibrate?.(6);
    start(async () => {
      const r = await stanceAction(type, id, next);
      if (r.ok) (setSplit(r.data), onChange?.(r.data));
      else (setSplit(prev), onChange?.(prev), toast(r.error, "error"));
    });
  };

  const a = pct(split.agree, split.total);
  const d = pct(split.disagree, split.total);
  const u = split.total ? 100 - a - d : 0;
  const btn = (v: StanceValue, label: string, Icon: typeof AgreeIcon, tone: string) => (
    <button
      type="button"
      data-action={v === "agree" ? "agree" : v === "disagree" ? "disagree" : "unsure"}
      onClick={(e) => (e.stopPropagation(), cast(v))}
      aria-pressed={split.mine === v}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[4px] font-semibold transition-all duration-150 active:translate-y-px ${
        variant === "compact" ? "h-9 px-2.5 text-[12.5px]" : "h-11 flex-1 px-3 text-[14px]"
      } ${split.mine === v ? `${tone} text-on-signal` : "text-ink-2 ring-1 ring-rule hover:ring-rule-strong hover:text-ink-1"}`}
    >
      <span key={split.mine === v ? "on" : "off"} className={split.mine === v ? "animate-pop" : ""}><Icon size={variant === "compact" ? 15 : 17} strokeWidth={1.9} /></span>
      {label}
    </button>
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {btn("agree", "Agree", AgreeIcon, "bg-agree")}
        {btn("disagree", "Disagree", DisagreeIcon, "bg-disagree")}
        <div className="ml-1 hidden min-w-0 flex-1 items-center gap-2 sm:flex" title={`${a}% agree · ${u}% unsure · ${d}% disagree`}>
          <SplitBar split={split} height={4} className="max-w-[120px]" />
          <span className="mono shrink-0 text-[11.5px] text-ink-3">{split.total ? `${a}/${d}` : "—"}</span>
        </div>
        <span className="sr-only" aria-live="polite">{split.total ? `${a}% agree, ${d}% disagree, ${split.total} stances` : "No stances yet"}</span>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className={variant === "tile" ? "" : ""}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="mono text-[clamp(1.6rem,1.2rem+1.4vw,2.3rem)] leading-none font-semibold text-agree">{a}%</p>
          <p className="folio mt-1 text-ink-3">Agree</p>
        </div>
        <p className="folio pb-1 text-center text-ink-3">
          <span className="mono block text-[13px] tracking-normal text-ink-2">{split.total.toLocaleString("en-US")}</span>stances
        </p>
        <div className="text-right">
          <p className="mono text-[clamp(1.6rem,1.2rem+1.4vw,2.3rem)] leading-none font-semibold text-disagree">{d}%</p>
          <p className="folio mt-1 text-ink-3">Disagree</p>
        </div>
      </div>
      <SplitBar split={split} height={10} className="mt-3 w-full" />
      <p className="mt-1.5 text-center text-[12px] text-ink-3">{u}% unsure</p>
      <div className="mt-3 flex gap-2">
        {btn("agree", "Agree", AgreeIcon, "bg-agree")}
        {btn("unsure", "Unsure", QuestionIcon, "bg-ink-3")}
        {btn("disagree", "Disagree", DisagreeIcon, "bg-disagree")}
      </div>
      <span className="sr-only" aria-live="polite">{`${a}% agree, ${u}% unsure, ${d}% disagree`}{split.mine ? `. Your stance: ${split.mine}` : ""}</span>
    </div>
  );
}

/** Read-only mini meter for lists (Hot Stories, tiles). */
export function MiniSplit({ split, className = "" }: { split: Split; className?: string }) {
  const a = pct(split.agree, split.total);
  const d = pct(split.disagree, split.total);
  return (
    <div className={`flex items-center gap-2 ${className}`} title={`${a}% agree · ${d}% disagree`}>
      <SplitBar split={split} height={4} className="w-16" />
      <span className="mono text-[11px] text-ink-3"><span className="text-agree">{a}</span>/<span className="text-disagree">{d}</span></span>
      <span className="sr-only">{a}% agree, {d}% disagree</span>
    </div>
  );
}
