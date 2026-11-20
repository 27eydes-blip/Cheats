import Link from "next/link";
import { APP_NAME } from "@/config";

/**
 * The Townsquare stamp: a navy square with a gold inset frame and a serif "T",
 * like a press seal. The wordmark is set in the display serif.
 */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="6" fill="#0b1f4b" />
      <rect x="5" y="5" width="54" height="54" rx="3" fill="none" stroke="#c8a24a" strokeWidth="2" />
      <path d="M17 18h30v8h-3.2l-1.4-3.6H35V44l4 1.6V48H25v-2.4l4-1.6V22.4h-7.4L20.2 26H17z" fill="#ffffff" />
      <rect x="17" y="51" width="30" height="2.2" fill="#c8a24a" />
    </svg>
  );
}

export function Wordmark({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "text-[clamp(2.4rem,1.6rem+2.4vw,3.6rem)]" : size === "sm" ? "text-[1.35rem]" : "text-[1.6rem]";
  return <span className={`font-display leading-none font-semibold tracking-[-0.03em] text-navy-ink ${s} ${className}`}>{APP_NAME}</span>;
}

export function Logo({ compact, className = "", size = "md" }: { compact?: boolean; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label={`${APP_NAME} front page`}>
      <LogoMark size={size === "lg" ? 44 : size === "sm" ? 26 : 30} className="transition-transform duration-200 group-hover:-rotate-3" />
      {!compact && <Wordmark size={size} />}
    </Link>
  );
}
