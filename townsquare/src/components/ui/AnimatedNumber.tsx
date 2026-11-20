"use client";

import { useEffect, useRef, useState } from "react";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

/**
 * A count that rolls up or down when it changes (old value slides out, new
 * slides in). Width stays stable thanks to tabular numbers.
 */
export function AnimatedNumber({ value, className = "", hideZero }: { value: number; className?: string; hideZero?: boolean }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState<number | null>(null);
  const dir = useRef<1 | -1>(1);
  useEffect(() => {
    if (value === shown) return;
    dir.current = value > shown ? 1 : -1;
    setPrev(shown);
    setShown(value);
    const t = setTimeout(() => setPrev(null), 300);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  if (hideZero && value === 0 && prev === null) return <span className={className} />;
  return (
    <span className={`num relative inline-flex overflow-hidden align-bottom ${className}`} aria-live="off">
      <span key={shown} className="inline-block" style={prev !== null ? { animation: `roll-in-${dir.current > 0 ? "up" : "down"} 260ms var(--ease-out)` } : undefined}>
        {hideZero && shown === 0 ? "" : fmt(shown)}
      </span>
      {prev !== null && (
        <span aria-hidden="true" className="absolute inset-0 inline-block" style={{ animation: `roll-out-${dir.current > 0 ? "up" : "down"} 260ms var(--ease-out) forwards` }}>
          {hideZero && prev === 0 ? "" : fmt(prev)}
        </span>
      )}
    </span>
  );
}

export { fmt as formatCount };
