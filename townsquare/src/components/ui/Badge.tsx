import { useId } from "react";

/** Small status marks: verified seal, LIVE pill, kickers, outlet labels, severity tags. */

export function VerifiedSeal({ size = 16, className = "" }: { size?: number; className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified" className={`inline-block shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`v${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#5b2ee8" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#v${u})`}
        d="M12 1.6c.9 0 1.7.5 2.2 1.2l.6.9 1.1-.1a2.6 2.6 0 0 1 2.8 2.1l.2 1.1 1 .5a2.6 2.6 0 0 1 1.1 3.3l-.4 1 .6.9a2.6 2.6 0 0 1-.7 3.4l-.9.6v1.1a2.6 2.6 0 0 1-2.5 2.6l-1.1.1-.5 1a2.6 2.6 0 0 1-3.3 1.2l-1-.4-.9.6a2.6 2.6 0 0 1-3.5-.7l-.6-.9H5a2.6 2.6 0 0 1-2.6-2.5l-.1-1.1-1-.5a2.6 2.6 0 0 1-1.1-3.3l.4-1-.6-.9a2.6 2.6 0 0 1 .7-3.5l.9-.6V6.9a2.6 2.6 0 0 1 2.5-2.6l1.1-.1.5-1A2.6 2.6 0 0 1 8.9 2l1 .4.9-.5c.4-.2.8-.3 1.2-.3z"
      />
      <path d="m7.6 12.3 3 3 5.8-6.2" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LiveDot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 animate-live rounded-full bg-live ${className}`} />;
}

export function LiveBadge({ label = "LIVE", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md bg-live px-1.5 py-0.5 text-[10.5px] leading-none font-black tracking-[0.1em] text-white ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      {label}
    </span>
  );
}

export function Kicker({ children, tone = "accent", className = "" }: { children: React.ReactNode; tone?: "accent" | "breaking" | "muted"; className?: string }) {
  const c = tone === "breaking" ? "text-breaking dark:text-live" : tone === "muted" ? "text-ink-3" : "text-accent";
  return <span className={`kicker ${c} ${className}`}>{children}</span>;
}

/** Outlet label with a monogram "favicon" tile (no third-party favicon requests). */
export function SourceLabel({ name, className = "", size = "sm" }: { name: string; className?: string; size?: "sm" | "md" }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const initials = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name[0];
  const box = size === "md" ? "h-6 w-6 text-[10px] rounded-[7px]" : "h-[18px] w-[18px] text-[8.5px] rounded-[5px]";
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center font-black text-white ${box}`} style={{ background: `hsl(${h} 45% 32%)` }}>
        {initials}
      </span>
      <span className={`truncate font-semibold text-ink-1 ${size === "md" ? "text-[13.5px]" : "text-[12.5px]"}`}>{name}</span>
    </span>
  );
}

const SEV = {
  critical: "bg-breaking text-white",
  high: "bg-danger-soft text-danger ring-1 ring-danger/30",
  medium: "bg-warning-bg text-warning ring-1 ring-warning/30",
  low: "bg-surface-2 text-ink-2 ring-1 ring-line",
} as const;

export function SeverityTag({ level, children }: { level: keyof typeof SEV; children?: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${SEV[level]}`}>{children ?? level}</span>;
}
