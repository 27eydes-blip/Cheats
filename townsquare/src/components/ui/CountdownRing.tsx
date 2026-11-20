/** Circular progress ring (used for poll time left and scheduled shows). `progress` is 0..1 of time remaining. */
export function CountdownRing({ progress, size = 18, stroke = 2.5, color = "var(--accent)", label }: { progress: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        style={{ transition: "stroke-dasharray 600ms var(--ease-out)" }}
      />
    </svg>
  );
}
