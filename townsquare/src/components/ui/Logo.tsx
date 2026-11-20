import Link from "next/link";
import { useId } from "react";
import { APP_NAME } from "@/config";

/**
 * The WorldNet News mark: a globe wired as a network (nodes and links), a cyan
 * hub node, on an electric-blue tile. Same drawing as public/icon.svg.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b78ff" /><stop offset="1" stopColor="#1c46cc" /></linearGradient>
        <radialGradient id={`g${id}`} cx="0.7" cy="0.25" r="0.55"><stop offset="0" stopColor="#22d3ee" stopOpacity="0.5" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#b${id})`} />
      <rect width="64" height="64" rx="14" fill={`url(#g${id})`} />
      <g fill="none" stroke="#fff" strokeLinecap="round">
        <circle cx="32" cy="32" r="19" strokeWidth="3.2" />
        <ellipse cx="32" cy="32" rx="8.5" ry="19" strokeWidth="1.6" opacity="0.55" />
        <path d="M13.5 32h37" strokeWidth="1.6" opacity="0.55" />
      </g>
      <path d="M21 23 L35 27 L44 19 M35 27 L42 40 L27 44 L21 23 M35 27 L27 44" stroke="#a5f3fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <g fill="#fff" stroke="#1c46cc" strokeWidth="1.4">
        <circle cx="21" cy="23" r="3.2" /><circle cx="44" cy="19" r="3" /><circle cx="42" cy="40" r="3.2" /><circle cx="27" cy="44" r="3" />
      </g>
      <circle cx="35" cy="27" r="4.4" fill="#22d3ee" stroke="#0b1220" strokeWidth="1.6" />
    </svg>
  );
}

/** Bold condensed wordmark: WORLDNET + a NEWS chip. `short` drops the chip. */
export function Wordmark({ className = "", size = "md", short }: { className?: string; size?: "sm" | "md" | "lg"; short?: boolean }) {
  const s = size === "lg" ? "text-[clamp(1.9rem,1.2rem+1.6vw,2.6rem)]" : size === "sm" ? "text-[1.45rem]" : "text-[1.7rem]";
  return (
    <span className={`inline-flex items-center gap-1.5 font-display leading-none font-extrabold tracking-[0.01em] whitespace-nowrap uppercase ${s} ${className}`} role="img" aria-label={APP_NAME}>
      <span aria-hidden="true">World<span className="text-[var(--wn-cyan-wordmark,currentColor)]">Net</span></span>
      {!short && <span aria-hidden="true" className="rounded-[5px] bg-[#070b14] px-[0.32em] py-[0.12em] text-[0.5em] tracking-[0.14em] text-white ring-1 ring-white/25">NEWS</span>}
    </span>
  );
}

export function Logo({ compact, className = "", size = "md" }: { compact?: boolean; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label={`${APP_NAME} front page`}>
      <LogoMark size={size === "lg" ? 44 : size === "sm" ? 28 : 34} className="transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-105" />
      {!compact && <Wordmark size={size} />}
    </Link>
  );
}
