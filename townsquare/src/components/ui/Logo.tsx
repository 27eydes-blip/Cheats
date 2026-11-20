import Link from "next/link";
import { APP_NAME, APP_SHORT } from "@/config";

/**
 * The World Net News stamp: a navy square with a gold inset frame and a serif "W",
 * like a press seal. The wordmark is set in the display serif.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="6" fill="#0b1f4b" />
      <rect x="5" y="5" width="54" height="54" rx="3" fill="none" stroke="#c8a24a" strokeWidth="2" />
      <path d="M14.5 19.5h11v2.6h-2.6l4.6 15.4 4.5-13.6-0.6-1.8h-2.2v-2.6h10.6v2.6h-2.4l4.6 15.4 4.4-15.4h-2.6v-2.6h8.7v2.6h-2.1l-7.2 24.6h-3.2l-5-15.6-5.2 15.6h-3.2l-7.3-24.6h-2.1z" fill="#ffffff" />
      <rect x="17" y="51" width="30" height="2.2" fill="#c8a24a" />
    </svg>
  );
}

export function Wordmark({ className = "", size = "md", short }: { className?: string; size?: "sm" | "md" | "lg"; short?: boolean }) {
  const s = size === "lg" ? "text-[clamp(2rem,0.6rem+2.6vw,3.3rem)]" : size === "sm" ? "text-[1.35rem]" : "text-[1.6rem]";
  return <span className={`font-display leading-none font-semibold tracking-[-0.03em] whitespace-nowrap text-navy-ink ${s} ${className}`}>{short ? APP_SHORT : APP_NAME}</span>;
}

export function Logo({ compact, className = "", size = "md" }: { compact?: boolean; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label={`${APP_NAME} front page`}>
      <LogoMark size={size === "lg" ? 44 : size === "sm" ? 26 : 30} className="transition-transform duration-200 group-hover:-rotate-3" />
      {!compact && <Wordmark size={size} />}
    </Link>
  );
}
