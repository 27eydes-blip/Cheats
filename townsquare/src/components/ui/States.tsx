import Link from "next/link";
import { useId } from "react";

type Art = "feed" | "bookmarks" | "notifications" | "search" | "community" | "live" | "news" | "done";

/** Friendly spot illustrations built from the brand palette (inline SVG, theme-aware). */
export function Illustration({ art, size = 132 }: { art: Art; size?: number }) {
  const g = `il${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 160 124" aria-hidden="true" className="mx-auto">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a3570" />
          <stop offset="1" stopColor="#0b1f4b" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="112" rx="58" ry="8" fill="var(--line)" />
      <rect x="30" y="8" width="100" height="100" rx="4" fill="var(--paper-2)" /><rect x="30" y="8" width="100" height="3" fill="var(--gold)" />
      {art === "feed" && (
        <g>
          <rect x="38" y="30" width="84" height="22" rx="8" fill="var(--surface)" stroke="var(--line-strong)" />
          <rect x="44" y="58" width="84" height="22" rx="8" fill="var(--surface)" stroke="var(--line-strong)" />
          <rect x="32" y="86" width="84" height="18" rx="8" fill={`url(#${g})`} />
          <circle cx="50" cy="41" r="6" fill={`url(#${g})`} /><rect x="61" y="37" width="44" height="4" rx="2" fill="var(--line-strong)" /><rect x="61" y="44" width="30" height="4" rx="2" fill="var(--line)" />
          <circle cx="56" cy="69" r="6" fill="var(--surface-3)" /><rect x="67" y="65" width="44" height="4" rx="2" fill="var(--line-strong)" />
          <rect x="42" y="93" width="50" height="4" rx="2" fill="#fff" opacity=".8" />
        </g>
      )}
      {art === "bookmarks" && (
        <g>
          <rect x="52" y="22" width="56" height="74" rx="10" fill="var(--surface)" stroke="var(--line-strong)" />
          <path d="M66 22h28v40l-14-10-14 10z" fill={`url(#${g})`} />
          <rect x="62" y="72" width="36" height="4" rx="2" fill="var(--line-strong)" /><rect x="62" y="80" width="24" height="4" rx="2" fill="var(--line)" />
        </g>
      )}
      {art === "notifications" && (
        <g>
          <path d="M80 26c-15 0-25 11-25 27 0 18-8 24-8 24h66s-8-6-8-24c0-16-10-27-25-27z" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="1.5" />
          <circle cx="80" cy="86" r="7" fill={`url(#${g})`} />
          <circle cx="104" cy="32" r="9" fill="var(--live)" /><path d="M100 32h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {art === "search" && (
        <g>
          <circle cx="72" cy="54" r="24" fill="var(--surface)" stroke={`url(#${g})`} strokeWidth="7" />
          <path d="m90 72 18 18" stroke={`url(#${g})`} strokeWidth="9" strokeLinecap="round" />
          <rect x="62" y="48" width="20" height="4" rx="2" fill="var(--line-strong)" /><rect x="62" y="56" width="13" height="4" rx="2" fill="var(--line)" />
        </g>
      )}
      {art === "community" && (
        <g>
          <circle cx="58" cy="52" r="14" fill="var(--surface)" stroke="var(--line-strong)" /><circle cx="102" cy="52" r="14" fill="var(--surface)" stroke="var(--line-strong)" />
          <circle cx="80" cy="44" r="17" fill={`url(#${g})`} />
          <path d="M40 96c2-16 12-24 22-24M120 96c-2-16-12-24-22-24M56 98c2-18 12-28 24-28s22 10 24 28" fill="none" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {art === "live" && (
        <g>
          <rect x="36" y="30" width="88" height="58" rx="12" fill="var(--surface)" stroke="var(--line-strong)" />
          <path d="M72 46v26l22-13z" fill={`url(#${g})`} />
          <rect x="44" y="37" width="24" height="10" rx="3" fill="var(--live)" />
        </g>
      )}
      {art === "news" && (
        <g>
          <rect x="38" y="26" width="76" height="76" rx="8" fill="var(--surface)" stroke="var(--line-strong)" />
          <rect x="46" y="34" width="60" height="10" rx="2" fill={`url(#${g})`} />
          <rect x="46" y="50" width="28" height="22" rx="3" fill="var(--surface-3)" />
          {[50, 57, 64].map((y) => <rect key={y} x="79" y={y} width="27" height="3.5" rx="1.75" fill="var(--line-strong)" />)}
          {[80, 87, 94].map((y) => <rect key={y} x="46" y={y} width="60" height="3.5" rx="1.75" fill="var(--line)" />)}
        </g>
      )}
      {art === "done" && (
        <g>
          <circle cx="80" cy="58" r="26" fill={`url(#${g})`} />
          <path d="m68 58 8 8 16-17" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      <rect x="18" y="26" width="6" height="6" fill="var(--gold)" /><rect x="138" y="80" width="5" height="5" fill="var(--navy-ink)" opacity=".5" />
    </svg>
  );
}

export function EmptyState({ art = "feed", title, body, action }: { art?: Art; title: string; body?: React.ReactNode; action?: { label: string; href: string } }) {
  return (
    <div className="animate-enter px-6 py-14 text-center">
      <Illustration art={art} />
      <h2 className="mt-5 font-display text-h2 font-semibold text-ink-1">{title}</h2>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-ink-3">{body}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message = "Couldn't load this.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-4 my-4 flex items-center gap-3 border-l-2 border-disagree bg-danger-soft px-4 py-3 text-[14.5px] text-disagree">
      <span className="flex-1 font-medium">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline !min-h-9 !px-3.5 !text-[13.5px]">
          Retry
        </button>
      )}
    </div>
  );
}
