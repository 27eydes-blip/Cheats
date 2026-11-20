import { useId } from "react";

/** Generated banner art for a community (topographic waves in its own colors). */
export function CommunityArt({ slug, className = "" }: { slug: string; className?: string }) {
  let h = 11;
  for (const c of slug) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 35 + (h % 60)) % 360;
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={`block h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`ca${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${a} 72% 50%)`} />
          <stop offset="1" stopColor={`hsl(${b} 70% 26%)`} />
        </linearGradient>
      </defs>
      <rect width="600" height="200" fill={`url(#ca${u})`} />
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M-20 ${40 + i * 22} C 120 ${10 + i * 22 + (h % 40)}, 260 ${80 + i * 20 - (h % 50)}, 380 ${40 + i * 22} S 560 ${10 + i * 24}, 640 ${50 + i * 21}`}
          fill="none"
          stroke="#fff"
          strokeOpacity={0.07 + (i % 3) * 0.03}
          strokeWidth="2"
        />
      ))}
      <circle cx={480 - (h % 200)} cy={60} r={52} fill={`hsl(${(a + 160) % 360} 90% 75%)`} opacity="0.3" />
    </svg>
  );
}

export function CommunityIconTile({ slug, name, size = 48 }: { slug: string; name: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] font-display font-semibold text-white shadow-1 ring-2 ring-[var(--avatar-gap,var(--surface))]" style={{ width: size, height: size, fontSize: size * 0.46 }}>
      <span className="absolute inset-0"><CommunityArt slug={slug} /></span>
      <span className="relative">{name[0]}</span>
    </span>
  );
}
