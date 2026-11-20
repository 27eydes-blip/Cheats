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
