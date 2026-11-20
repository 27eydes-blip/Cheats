import { useId } from "react";
import type { StoryPhoto } from "@/lib/news";

/** Per-section accent and icon. Everything else is the house blue/cyan. */
const SECTION: Record<string, { accent: string; icon: number; label: string }> = {
  Politics: { accent: "#ff2d4a", icon: 0, label: "Politics" },
  World: { accent: "#22d3ee", icon: 1, label: "World" },
  Business: { accent: "#34d399", icon: 2, label: "Business" },
  Tech: { accent: "#a78bfa", icon: 3, label: "Tech" },
  Sports: { accent: "#f59e0b", icon: 4, label: "Sports" },
  Culture: { accent: "#f472b6", icon: 5, label: "Culture" },
  "Top Stories": { accent: "#22d3ee", icon: 6, label: "National" },
};

/**
 * The image slot for every Story. An editor's uploaded photo (Control Room →
 * Story photos) always wins; otherwise this draws original cover art in code:
 * a gradient mesh in the house blue/cyan with the section's accent, a halftone
 * field, a network of nodes, scanlines, and a large outline icon for the
 * section. Deterministic per story, no image requests, never a gray box.
 */
export function StoryArt({ seed, section, className = "", photo, width = 1200, priority, hero }: { seed: string; section: string; className?: string; photo?: StoryPhoto | null; width?: number; priority?: boolean; /** headline overlays the lower half: keep the icon small and high */ hero?: boolean }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (photo) return <StoryPhotoView photo={photo} className={className} width={width} priority={priority} />;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let st = h;
  const rnd = () => ((st = Math.imul(st ^ (st >>> 15), 2246822507) ^ Math.imul(st ^ (st >>> 13), 3266489909)) >>> 0) / 4294967296;
  const sec = SECTION[section] ?? SECTION["Top Stories"];
  const b1 = { x: 80 + rnd() * 200, y: 60 + rnd() * 200 };
  const b2 = { x: 360 + rnd() * 220, y: 40 + rnd() * 160 };
  const b3 = { x: 200 + rnd() * 300, y: 260 + rnd() * 120 };
  const nodes = Array.from({ length: 9 }, () => ({ x: 30 + rnd() * 580, y: 30 + rnd() * 340 }));
  const links: [number, number][] = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
    near.forEach(({ j }) => i < j && links.push([i, j]));
  });
  const iconX = hero ? 452 : 432 + rnd() * 24; // inside the crop from 1:1 phones to 21:9 desktops
  const iconY = hero ? 84 : 132 + rnd() * 16;
  const W = "rgb(255 255 255 / 0.9)";

  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={`block h-full w-full bg-[#070b14] ${className}`}>
      <defs>
        <radialGradient id={`m1${u}`} cx={b1.x / 640} cy={b1.y / 400} r="0.6"><stop offset="0" stopColor="#2f6bff" stopOpacity="0.95" /><stop offset="1" stopColor="#2f6bff" stopOpacity="0" /></radialGradient>
        <radialGradient id={`m2${u}`} cx={b2.x / 640} cy={b2.y / 400} r="0.45"><stop offset="0" stopColor={sec.accent} stopOpacity="0.55" /><stop offset="1" stopColor={sec.accent} stopOpacity="0" /></radialGradient>
        <radialGradient id={`m3${u}`} cx={b3.x / 640} cy={b3.y / 400} r="0.5"><stop offset="0" stopColor="#22d3ee" stopOpacity="0.4" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></radialGradient>
        <linearGradient id={`v${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stopColor="#070b14" stopOpacity="0" /><stop offset="1" stopColor="#070b14" stopOpacity="0.75" /></linearGradient>
        <pattern id={`d${u}`} width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="1.4" fill="#fff" /></pattern>
        <linearGradient id={`dm${u}`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0.32" /><stop offset="0.55" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <mask id={`mk${u}`}><rect width="640" height="400" fill={`url(#dm${u})`} /></mask>
        <pattern id={`s${u}`} width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity="0.035" /></pattern>
      </defs>
      <rect width="640" height="400" fill="#0b1430" />
      <rect width="640" height="400" fill={`url(#m1${u})`} />
      <rect width="640" height="400" fill={`url(#m3${u})`} />
      <rect width="640" height="400" fill={`url(#m2${u})`} />
      <rect width="640" height="400" fill={`url(#d${u})`} mask={`url(#mk${u})`} />
      <g stroke="#a5f3fc" strokeWidth="1.2" opacity="0.4">
        {links.map(([a, b]) => <line key={`${a}-${b}`} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} />)}
      </g>
      <g>
        {nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={i % 3 === 0 ? 4 : 2.5} fill={i % 4 === 0 ? sec.accent : "#fff"} opacity={i % 3 === 0 ? 0.95 : 0.6} />)}
      </g>
      <g transform={`translate(${iconX} ${iconY}) scale(${hero ? 1.05 : 1.45})`} fill="none" stroke={W} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <SectionIcon n={sec.icon} accent={sec.accent} />
      </g>
      <rect width="640" height="400" fill={`url(#s${u})`} />
      <rect width="640" height="400" fill={`url(#v${u})`} />
    </svg>
  );
}

/** Large outline icons drawn on a ~100×100 grid centered at 0,0. */
function SectionIcon({ n, accent }: { n: number; accent: string }) {
  switch (n) {
    case 0: // capitol dome
      return (
        <>
          <path d="M-46 44h92M-40 44V16h80v28M-44 16h88M-30 16c0-26 13-42 30-42s30 16 30 42" />
          <path d="M0-26v-16M-6-42h12" />
          {[-30, -18, -6, 6, 18, 30].map((x) => <path key={x} d={`M${x} 22v16`} />)}
          <circle cx="0" cy="-46" r="3" fill={accent} stroke="none" />
        </>
      );
    case 1: // globe
      return (
        <>
          <circle r="44" />
          <ellipse rx="18" ry="44" />
          <path d="M-44 0h88M-38-22h76M-38 22h76" opacity="0.7" />
          <circle cx="26" cy="-18" r="5" fill={accent} stroke="none" />
        </>
      );
    case 2: // candles + trend
      return (
        <>
          {[-36, -18, 0, 18, 36].map((x, i) => {
            const top = [-6, 6, -16, -4, -30][i];
            return <g key={x}><path d={`M${x} ${top - 10}v${44 - top}`} strokeWidth="2" /><rect x={x - 6} y={top} width="12" height={26 - (i % 2) * 8} fill={i % 2 ? "none" : accent} stroke={i % 2 ? undefined : "none"} /></g>;
          })}
          <path d="M-48 30 L-20 12 L4 20 L46-34" stroke={accent} />
          <path d="M34-34h12v12" stroke={accent} />
        </>
      );
    case 3: // chip
      return (
        <>
          <rect x="-30" y="-30" width="60" height="60" rx="8" />
          <rect x="-14" y="-14" width="28" height="28" rx="4" fill={accent} stroke="none" opacity="0.85" />
          {[-18, -6, 6, 18].map((p) => <path key={p} d={`M${p}-30v-12M${p} 30v12M-30 ${p}h-12M30 ${p}h12`} strokeWidth="2.4" />)}
        </>
      );
    case 4: // ball + motion
      return (
        <>
          <circle r="36" />
          <path d="M-36 0c18-10 54-10 72 0M0-36c-10 18-10 54 0 72" opacity="0.8" />
          <path d="M-70-14h18M-76 4h22M-68 22h14" stroke={accent} />
        </>
      );
    case 5: // clapper / stage
      return (
        <>
          <rect x="-44" y="-8" width="88" height="52" rx="6" />
          <path d="M-44-8 L-36-34 L44-34 L44-8" />
          {[-28, -8, 12, 32].map((x) => <path key={x} d={`M${x}-34 L${x - 8}-8`} stroke={accent} />)}
          <path d="M-8 6v26l22-13z" fill={accent} stroke="none" />
        </>
      );
    default: // broadcast
      return (
        <>
          <circle r="8" fill={accent} stroke="none" />
          <path d="M-22-22a31 31 0 0 0 0 44M22-22a31 31 0 0 1 0 44M-38-38a54 54 0 0 0 0 76M38-38a54 54 0 0 1 0 76" />
          <path d="M0 8v40M-14 48h28" />
        </>
      );
  }
}

function StoryPhotoView({ photo, className, width, priority }: { photo: StoryPhoto; className: string; width: number; priority?: boolean }) {
  return (
    <span className="relative block h-full w-full overflow-hidden bg-[#0b1430]" style={photo.blur ? { backgroundImage: `url(${photo.blur})`, backgroundSize: "cover" } : undefined}>
      <img
        src={`${photo.url}?w=${width > 960 ? 1280 : width > 640 ? 960 : 640}`}
        srcSet={`${photo.url}?w=640 640w, ${photo.url}?w=960 960w, ${photo.url}?w=1280 1280w`}
        sizes={width <= 640 ? "(min-width: 1024px) 33vw, 100vw" : "(min-width: 1024px) 66vw, 100vw"}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
      {photo.credit && <span className="absolute right-1.5 bottom-1.5 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">{photo.credit}</span>}
    </span>
  );
}
