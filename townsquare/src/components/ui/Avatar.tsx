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

export function Avatar({ url, name, handle, size = 44, live, ring = size >= 30, className = "" }: Props) {
  const { h1, h2 } = palette(handle);
  const pad = ring ? Math.max(2, Math.round(size / 24)) : 0;
  const inner = size - pad * 4;
  const content = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={inner} height={inner} loading="lazy" decoding="async" className="block h-full w-full object-cover" />
  ) : (
    <AvatarArt handle={handle} size={ring ? inner : size} />
  );
  if (!ring && !live) {
    return (
      <span className={`inline-block shrink-0 overflow-hidden rounded-full bg-surface-2 ${className}`} style={{ width: size, height: size }} title={name}>
        {content}
      </span>
    );
  }
  return (
    <span
      className={`relative inline-flex shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        padding: pad,
        background: live ? "var(--live)" : `linear-gradient(140deg, hsl(${h1} 85% 60%), hsl(${h2} 80% 50%))`,
      }}
      title={live ? `${name} is live` : name}
    >
      {live && <span aria-hidden="true" className="absolute inset-0 animate-[live-ring_1.6s_ease-in-out_infinite] rounded-full ring-2 ring-live" />}
      <span className="block h-full w-full rounded-full" style={{ padding: pad, background: "var(--avatar-gap, var(--canvas))" }}>
        <span className="block h-full w-full overflow-hidden rounded-full bg-surface-2">{content}</span>
      </span>
      {live && size >= 40 && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-[4px] bg-live px-1 text-[9px] leading-[14px] font-black tracking-wider text-white ring-2 ring-canvas">LIVE</span>
      )}
    </span>
  );
}
