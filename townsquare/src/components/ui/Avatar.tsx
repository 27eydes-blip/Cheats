import { useId } from "react";

/**
 * Avatars with a gradient ring. Without a photo, a unique abstract artwork is
 * generated from the handle (deterministic, inline SVG, no request). Accounts
 * that are live right now get a pulsing red ring.
 */
type Props = {
  url: string | null;
  name: string;
  handle: string;
  size?: number;
  live?: boolean;
  ring?: boolean;
  className?: string;
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Two hues and a layout seed per handle. Exported for profile banners. */
export function palette(handle: string) {
  const h = hash(handle.toLowerCase());
  const h1 = h % 360;
  const h2 = (h1 + 40 + ((h >> 9) % 80)) % 360;
  return { h1, h2, seed: h };
}

/** Bauhaus-style composition: four related colors, a slab, a disc, and a line, placed by the hash. */
export function AvatarArt({ handle, size }: { handle: string; size: number }) {
  const { h1, h2, seed } = palette(handle);
  const r = (n: number, mod: number) => ((seed >>> n) & 0xff) % mod;
  const id = `av${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = [`hsl(${h1} 70% 52%)`, `hsl(${h2} 75% 38%)`, `hsl(${(h1 + 150) % 360} 85% 64%)`, `hsl(${(h2 + 200) % 360} 90% 82%)`];
  const flip = seed & 1;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="block">
      <defs>
        <clipPath id={id}><rect width="64" height="64" /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="64" height="64" fill={c[0]} />
        <rect x={-8 + r(2, 20)} y={28 + r(5, 16)} width="80" height="48" fill={c[1]} transform={`rotate(${(flip ? -1 : 1) * (12 + r(8, 30))} 32 32)`} />
        <circle cx={flip ? 44 - r(11, 10) : 20 + r(11, 10)} cy={20 + r(14, 10)} r={13 + r(17, 8)} fill={c[2]} />
        <rect x={flip ? 6 : 38} y={8 + r(20, 30)} width={4 + r(23, 4)} height="30" rx="2" fill={c[3]} transform={`rotate(${r(26, 60) - 30} 32 32)`} />
      </g>
    </svg>
  );
}

const RING = { agree: "var(--agree)", disagree: "var(--disagree)", context: "var(--gold)", question: "var(--navy-ink)", unsure: "var(--unsure)" } as const;

/**
 * Byline portrait: square-rounded (not a circle), with an optional ring in the
 * color of the stance the person took. Live hosts get a pulsing red ring.
 */
export function Avatar({ url, name, handle, size = 44, live, ring, stance, className = "" }: Props & { stance?: keyof typeof RING | null }) {
  const radius = Math.max(4, Math.round(size * 0.2));
  const color = live ? "var(--live)" : stance ? RING[stance] : null;
  const content = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="block h-full w-full object-cover" />
  ) : (
    <AvatarArt handle={handle} size={size} />
  );
  void ring;
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={live ? `${name} is live` : name}
    >
      <span
        className="block h-full w-full overflow-hidden bg-paper-2"
        style={{ borderRadius: radius, boxShadow: color ? `0 0 0 2px var(--avatar-gap, var(--paper)), 0 0 0 ${size >= 40 ? 3.5 : 3}px ${color}` : "inset 0 0 0 1px var(--rule)" }}
      >
        {content}
      </span>
      {live && <span aria-hidden="true" className="absolute inset-[-4px] animate-[live-ring_1.6s_ease-in-out_infinite]" style={{ borderRadius: radius + 4, boxShadow: "0 0 0 2px var(--live)" }} />}
      {live && size >= 40 && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-[2px] bg-live-bg px-1 text-[8.5px] leading-[13px] font-black tracking-[0.12em] text-white">ON AIR</span>
      )}
    </span>
  );
}
