import { useId } from "react";
import { SourceLabel } from "../ui/Badge";

/**
 * Generated cover art for a link, seeded by its domain and path. Stage 1 does
 * not fetch remote pages (no SSRF risk), so the card brings its own visual.
 */
export function LinkArt({ seed, className = "" }: { seed: string; className?: string }) {
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 50 + (h % 70)) % 360;
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 400 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={`block h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`la${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${a} 70% 52%)`} />
          <stop offset="1" stopColor={`hsl(${b} 65% 28%)`} />
        </linearGradient>
      </defs>
      <rect width="400" height="210" fill={`url(#la${u})`} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={-40 + i * 70 + (h % 30)} y={30 + ((h >> (i * 2)) % 60)} width="46" height="220" rx="23" fill="#fff" opacity={0.05 + (i % 3) * 0.04} transform={`rotate(${18 + (h % 20)} 200 105)`} />
      ))}
      <circle cx={300 - (h % 120)} cy={70 + (h % 50)} r={38 + (h % 20)} fill={`hsl(${(a + 180) % 360} 90% 72%)`} opacity="0.45" />
    </svg>
  );
}

function prettyDomain(d: string) {
  const base = d.replace(/^www\./, "").split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Rich link card: big cover, outlet with monogram favicon, title, and domain. */
export function LinkCard({ link }: { link: { url: string; title: string | null; domain: string } }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => e.stopPropagation()}
      className="group mt-3 block overflow-hidden rounded-[var(--r-lg)] bg-surface ring-1 ring-line transition-shadow duration-200 hover:shadow-2"
    >
      <div className="aspect-[1.91/1] overflow-hidden">
        <LinkArt seed={link.url} className="transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className="px-3.5 pt-2.5 pb-3">
        <SourceLabel name={prettyDomain(link.domain)} />
        {link.title && <p className="mt-1 line-clamp-2 text-[15px] leading-snug font-semibold capitalize">{link.title}</p>}
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{link.domain}</p>
      </div>
    </a>
  );
}
