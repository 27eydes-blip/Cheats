import { useId } from "react";

/** Small status marks: verified seal (cyan→blue), LIVE / ON AIR (red), category tags, outlet labels, severity tags. */

export function VerifiedSeal({ size = 16, className = "" }: { size?: number; className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified" className={`inline-block shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`v${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#2f6bff" />
        </linearGradient>
      </defs>
      <path fill={`url(#v${u})`} d="M12 1.8 14.4 3.6l3-.2.9 2.9 2.6 1.6-.8 2.9.8 2.9-2.6 1.6-.9 2.9-3-.2L12 20.2l-2.4-1.8-3 .2-.9-2.9-2.6-1.6.8-2.9-.8-2.9 2.6-1.6.9-2.9 3 .2z" />
      <path d="m8 11.2 2.8 2.8 5.2-5.6" stroke="#070b14" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LiveDot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 animate-live rounded-full bg-live ${className}`} />;
}

/** ON AIR light (TV studio style), used for anything live. */
export function LiveBadge({ label = "ON AIR", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[6px] bg-live-bg px-2 py-[4px] text-[10.5px] leading-none font-extrabold tracking-[0.14em] text-white shadow-[0_0_16px_rgb(255_45_74/0.45)] ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      {label}
    </span>
  );
}

export function Kicker({ children, tone = "accent", className = "" }: { children: React.ReactNode; tone?: "accent" | "breaking" | "muted" | "gold"; className?: string }) {
  const c = tone === "breaking" ? "text-live" : tone === "muted" ? "text-ink-3" : tone === "gold" ? "text-gold-ink" : "text-navy-ink";
  return <span className={`folio ${c} ${className}`}>{children}</span>;
}

/** Category tag chip (Politics, World, …): blue glass pill. */
export function CategoryTag({ children, className = "", solid }: { children: React.ReactNode; className?: string; solid?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-[6px] px-2 py-[4px] text-[10.5px] leading-none font-extrabold tracking-[0.12em] uppercase ${solid ? "bg-[var(--wn-blue-fill)] text-white" : "bg-[rgb(47_107_255/0.16)] text-[var(--wn-blue-ink)] ring-1 ring-[rgb(127_163_255/0.3)]"} ${className}`}>
      {children}
    </span>
  );
}

/** Outlet label with a monogram "favicon" stamp (no third-party favicon requests). */
export function SourceLabel({ name, className = "", size = "sm", inverted }: { name: string; className?: string; size?: "sm" | "md"; inverted?: boolean }) {
  const initials = name.replace(/^The /, "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name[0];
  const box = size === "md" ? "h-6 w-6 text-[10px]" : "h-[18px] w-[18px] text-[8.5px]";
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-[5px] font-display font-bold ${box} ${inverted ? "bg-white text-[#1f4fd6]" : "bg-[var(--wn-blue-fill)] text-white"}`}>
        {initials}
      </span>
      <span className={`truncate font-semibold ${inverted ? "text-white" : "text-ink-1"} ${size === "md" ? "text-[13.5px]" : "text-[12.5px]"}`}>{name}</span>
    </span>
  );
}

const SEV = {
  critical: "bg-live-bg text-white",
  high: "bg-danger-soft text-disagree ring-1 ring-disagree/30",
  medium: "bg-warning-bg text-warning ring-1 ring-warning/30",
  low: "bg-paper-2 text-ink-2 ring-1 ring-rule",
} as const;

export function SeverityTag({ level, children }: { level: keyof typeof SEV; children?: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.1em] uppercase ${SEV[level]}`}>{children ?? level}</span>;
}

/** A thin rule with an optional centered folio label, like a newspaper section break. */
export function Rule({ label, className = "" }: { label?: string; className?: string }) {
  if (!label) return <hr className={`border-0 border-t border-rule ${className}`} />;
  return (
    <div className={`flex items-center gap-3 ${className}`} role="separator">
      <span className="h-px flex-1 bg-rule" />
      <span className="folio text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

/**
 * The AI account badge. Shown next to every AI newsroom account name: posts,
 * profiles, search, lists and notifications. Links to the About page.
 */
export function AiBadge({ className = "", size = "sm", link = false }: { className?: string; size?: "sm" | "md"; link?: boolean }) {
  const cls = `inline-flex shrink-0 items-center rounded-[5px] bg-[#e8eefc] px-[5px] font-sans font-extrabold tracking-[0.06em] text-[#123a99] ring-1 ring-[#123a99]/25 ${size === "md" ? "h-[20px] text-[12px]" : "h-[16px] text-[10.5px]"} ${className}`;
  return link ? (
    <a href="/about/ai" className={cls} title="AI account: how it works" aria-label="AI account (how it works)">AI</a>
  ) : (
    <span className={cls} title="AI account" aria-label="AI account" role="img">AI</span>
  );
}
