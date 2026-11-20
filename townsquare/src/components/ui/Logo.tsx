import Link from "next/link";
import { useId } from "react";
import { APP_NAME } from "@/config";

/**
 * The Townsquare mark: a gradient tile holding a bold "T" whose crossbar reads
 * as a headline rule, with a red live dot. The wordmark is set in the display serif.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`g${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="0.55" stopColor="#4338e6" />
          <stop offset="1" stopColor="#5b2ee8" />
        </linearGradient>
        <linearGradient id={`s${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#g${u})`} />
      <rect width="64" height="64" rx="16" fill={`url(#s${u})`} />
      <rect x="14" y="17" width="36" height="8" rx="2.5" fill="#fff" />
      <rect x="27.5" y="25" width="9" height="24" rx="2.5" fill="#fff" />
      <rect x="14" y="30" width="9" height="3" rx="1.5" fill="#fff" opacity="0.55" />
      <rect x="41" y="30" width="9" height="3" rx="1.5" fill="#fff" opacity="0.55" />
      <rect x="14" y="37" width="9" height="3" rx="1.5" fill="#fff" opacity="0.35" />
      <rect x="41" y="37" width="9" height="3" rx="1.5" fill="#fff" opacity="0.35" />
      <circle cx="51" cy="13" r="5" fill="#ff3b4a" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-display text-[1.45rem] leading-none font-semibold ${className}`}>{APP_NAME}</span>;
}

export function Logo({ compact, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2.5 rounded-xl ${className}`} aria-label={`${APP_NAME} home`}>
      <LogoMark size={compact ? 34 : 32} className="transition-transform duration-200 group-hover:-rotate-6" />
      {!compact && <Wordmark />}
    </Link>
  );
}
