"use client";

import { useId, useMemo, useRef, useState } from "react";

const UP = "#2ee6a6";
const DOWN = "#ff5c7a";

/** Glowing intraday area chart. Dashed line marks the previous close. Optional crosshair. */
export function AreaChart({ values, prevClose, height = 120, interactive, label }: { values: number[]; prevClose?: number; height?: number; interactive?: boolean; label?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const { pts, min, max } = useMemo(() => {
    const all = prevClose ? [...values, prevClose] : values;
    const mn = Math.min(...all);
    const mx = Math.max(...all);
    const pad = (mx - mn || 1) * 0.12;
    return { min: mn - pad, max: mx + pad, pts: values };
  }, [values, prevClose]);
  if (pts.length < 2) return <div style={{ height }} />;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const up = prevClose ? pts[pts.length - 1] >= prevClose : pts[pts.length - 1] >= pts[0];
  const c = up ? UP : DOWN;
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const lastX = x(pts.length - 1);
  const lastY = y(pts[pts.length - 1]);
  const hv = hover !== null ? pts[hover] : null;

  return (
    <div className="relative" style={{ height }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="img"
        aria-label={label ?? `Intraday chart, ${up ? "up" : "down"}`}
        onMouseMove={interactive ? (e) => {
          const r = ref.current!.getBoundingClientRect();
          setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1)))));
        } : undefined}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c} stopOpacity="0.32" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </linearGradient>
          <filter id={`g${id}`} x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {prevClose && <line x1="0" x2={W} y1={y(prevClose)} y2={y(prevClose)} stroke="rgb(200 210 240 / 0.35)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />}
        <path d={`${line} L${W} ${H} L0 ${H}Z`} fill={`url(#f${id})`} />
        <path d={line} fill="none" stroke={c} strokeWidth="5" opacity="0.35" filter={`url(#g${id})`} vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="rgb(227 199 115 / 0.7)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* pulsing last-price dot (outside the stretched SVG so it stays round) */}
      <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(lastX / W) * 100}%`, top: `${(lastY / H) * 100}%`, background: c, boxShadow: `0 0 0 4px ${c}33, 0 0 16px ${c}` }} />
      {hv !== null && hover !== null && (
        <span className="mono pointer-events-none absolute -top-1 rounded-[2px] bg-[#0b1f4b] px-1.5 py-0.5 text-[11px] text-white ring-1 ring-[#c8a24a]/60" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 34px), calc(100% - 72px))` }}>
          {hv.toFixed(2)}
        </span>
      )}
    </div>
  );
}

/** Tiny sparkline for list rows. */
export function MiniLine({ values, prevClose, width = 84, height = 28 }: { values: number[]; prevClose?: number; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ width, height }} />;
  const all = prevClose ? [...values, prevClose] : values;
  const mn = Math.min(...all);
  const mx = Math.max(...all) || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - mn) / (mx - mn || 1)) * (height - 4);
  const up = prevClose ? values[values.length - 1] >= prevClose : values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      {prevClose && <line x1="0" x2={width} y1={y(prevClose)} y2={y(prevClose)} stroke="rgb(200 210 240 / 0.25)" strokeDasharray="2 3" />}
      <path d={values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} fill="none" stroke={up ? UP : DOWN} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

/** Weekly bars from daily ones (keeps a 1-year candle chart readable). */
function weekly(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const d = new Date(b.t);
    const wk = Math.floor((b.t - d.getUTCDay() * 86_400_000) / (7 * 86_400_000));
    const last = out[out.length - 1] as (Bar & { wk?: number }) | undefined;
    if (last && last.wk === wk) Object.assign(last, { h: Math.max(last.h, b.h), l: Math.min(last.l, b.l), c: b.c, v: last.v + b.v });
    else out.push({ ...b, wk } as Bar);
  }
  return out;
}

const fmtVol = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v));

/**
 * The Market Board's main chart: line or candles, volume underneath, price
 * gridlines, and a crosshair (mouse or touch) with an OHLC + volume readout.
 */
export function PriceChart({ bars: raw, kind, range, baseline, height = 300 }: { bars: Bar[]; kind: "line" | "candle"; range: string; baseline?: number; height?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const bars = useMemo(() => (kind === "candle" && raw.length > 130 ? weekly(raw) : raw), [raw, kind]);
  const W = 1000;
  const PH = height * 0.76; // price pane
  const VH = height * 0.18; // volume pane
  const n = bars.length;
  const geo = useMemo(() => {
    if (!n) return null;
    const lo = Math.min(...bars.map((b) => (kind === "candle" ? b.l : b.c)), baseline ?? Infinity);
    const hi = Math.max(...bars.map((b) => (kind === "candle" ? b.h : b.c)), baseline ?? -Infinity);
    const pad = (hi - lo || 1) * 0.08;
    return { lo: lo - pad, hi: hi + pad, vmax: Math.max(1, ...bars.map((b) => b.v)) };
  }, [bars, n, kind, baseline]);
  if (!geo || n < 2) return <div style={{ height }} className="grid place-items-center text-[13px] text-white/50">No chart data for this range.</div>;
  const slot = W / n;
  const x = (i: number) => slot * i + slot / 2;
  const y = (v: number) => PH - ((v - geo.lo) / (geo.hi - geo.lo)) * PH;
  const first = baseline ?? bars[0].o;
  const up = bars[n - 1].c >= first;
  const col = up ? UP : DOWN;
  const line = bars.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(b.c).toFixed(1)}`).join(" ");
  const grid = [0.2, 0.4, 0.6, 0.8].map((f) => geo.lo + (geo.hi - geo.lo) * (1 - f));
  const hb = hover !== null ? bars[hover] : null;
  const intraday = range === "1D" || range === "5D";
  const when = (t: number) =>
    new Date(t).toLocaleString("en-US", intraday ? { timeZone: "America/New_York", weekday: range === "5D" ? "short" : undefined, hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: range === "1Y" ? "2-digit" : undefined });
  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n))));
  };
  const ticks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];

  return (
    <div>
      <div
        ref={ref}
        className="relative touch-pan-y select-none"
        style={{ height }}
        onPointerMove={(e) => move(e.clientX)}
        onPointerDown={(e) => move(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`${range} ${kind} chart, ${up ? "up" : "down"} ${(((bars[n - 1].c - first) / first) * 100).toFixed(2)}%`}>
          <defs>
            <linearGradient id={`pf${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.28" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient>
            <filter id={`pg${id}`} x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          {grid.map((g) => <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="rgb(255 255 255 / 0.06)" vectorEffect="non-scaling-stroke" />)}
          {baseline && <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} stroke="rgb(200 210 240 / 0.35)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />}
          {/* volume */}
          {bars.map((b, i) => {
            const h = (b.v / geo.vmax) * VH;
            return <rect key={`v${i}`} x={x(i) - slot * 0.35} width={slot * 0.7} y={height - h} height={h} fill={b.c >= b.o ? UP : DOWN} opacity={hover === i ? 0.7 : 0.28} />;
          })}
          {kind === "line" ? (
            <>
              <path d={`${line} L${x(n - 1)} ${PH} L${x(0)} ${PH}Z`} fill={`url(#pf${id})`} />
              <path d={line} fill="none" stroke={col} strokeWidth="5" opacity="0.35" filter={`url(#pg${id})`} vectorEffect="non-scaling-stroke" />
              <path d={line} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </>
          ) : (
            bars.map((b, i) => {
              const c = b.c >= b.o ? UP : DOWN;
              const top = y(Math.max(b.o, b.c));
              return (
                <g key={i}>
                  <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} stroke={c} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <rect x={x(i) - slot * 0.32} width={slot * 0.64} y={top} height={Math.max(1, y(Math.min(b.o, b.c)) - top)} fill={b.c >= b.o ? `${c}cc` : c} />
                </g>
              );
            })
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="rgb(227 199 115 / 0.7)" vectorEffect="non-scaling-stroke" />}
          {hb && <line x1="0" x2={W} y1={y(hb.c)} y2={y(hb.c)} stroke="rgb(227 199 115 / 0.35)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* price labels on the right */}
        {grid.map((g) => <span key={g} className="mono pointer-events-none absolute right-0 -translate-y-1/2 bg-[#081226]/70 px-1 text-[10px] text-white/45" style={{ top: `${(y(g) / height) * 100}%` }}>{g.toFixed(2)}</span>)}
        {kind === "line" && hover === null && <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${(x(n - 1) / W) * 100}%`, top: `${(y(bars[n - 1].c) / height) * 100}%`, background: col, boxShadow: `0 0 0 4px ${col}33, 0 0 16px ${col}` }} />}
        {hb && (
          <div className="mono pointer-events-none absolute top-0 z-10 rounded-[3px] bg-[#0b1f4b]/95 px-2.5 py-1.5 text-[11px] leading-[1.55] text-white shadow-lg ring-1 ring-[#c8a24a]/60" style={{ left: hover! > n / 2 ? 8 : undefined, right: hover! <= n / 2 ? 8 : undefined }}>
            <p className="text-[#e3c773]">{when(hb.t)}</p>
            <p>O {hb.o.toFixed(2)} &nbsp;H {hb.h.toFixed(2)}</p>
            <p>L {hb.l.toFixed(2)} &nbsp;C <b className={hb.c >= hb.o ? "text-[#2ee6a6]" : "text-[#ff5c7a]"}>{hb.c.toFixed(2)}</b></p>
            <p className="text-white/60">VOL {fmtVol(hb.v)}</p>
          </div>
        )}
      </div>
      <div className="mono mt-1.5 flex justify-between text-[10.5px] text-white/40">{ticks.map((i, k) => <span key={k}>{when(bars[i].t)}</span>)}</div>
    </div>
  );
}
