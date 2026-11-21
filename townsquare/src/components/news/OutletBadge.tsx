/** An outlet as a clean text badge: a small dot in the outlet's color, then its name. No logos (we don't have licenses for them). */
export function OutletBadge({ name, color, className = "" }: { name: string; color?: string | null; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: color || "#7fa3ff" }} />
      <span className="truncate font-semibold text-ink-1">{name}</span>
    </span>
  );
}
