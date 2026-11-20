import { useId } from "react";
import type { StoryPhoto } from "@/lib/news";

const MOTIF: Record<string, number> = { Politics: 0, World: 1, Business: 2, Tech: 3, Sports: 4, Culture: 5, "Top Stories": 6 };

/**
 * Editorial cover art for a Story, in the brand's navy and gold: a duotone
 * field, a gold disc, and a section motif (dome, globe grid, chart, circuit,
 * field lines, stage, isobars). Deterministic per story; no image requests.
 */
export function StoryArt({ seed, section, className = "", photo, width = 1200, priority }: { seed: string; section: string; className?: string; photo?: StoryPhoto | null; width?: number; priority?: boolean }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (photo) return <StoryPhotoView photo={photo} className={className} width={width} priority={priority} />;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const r = (n: number, m: number) => ((h >>> n) & 0xff) % m;
  const motif = MOTIF[section] ?? 6;
  const cx = 240 + r(3, 220);
  const lines = "rgb(255 255 255 / 0.16)";
  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={`block h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`b${u}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#1a3570" />
          <stop offset="1" stopColor="#081633" />
        </linearGradient>
        <radialGradient id={`s${u}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#e9cf86" />
          <stop offset="1" stopColor="#c8a24a" />
        </radialGradient>
        <pattern id={`h${u}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(255 255 255 / 0.05)" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width="640" height="400" fill={`url(#b${u})`} />
      <rect width="640" height="400" fill={`url(#h${u})`} />
      <circle cx={cx} cy={120 + r(9, 60)} r={70 + r(13, 40)} fill={`url(#s${u})`} opacity="0.92" />
      {motif === 0 && (
        <g fill="none" stroke="#fff" strokeWidth="2.2" opacity="0.85">
          <path d="M200 330V250h240v80M190 250h260M220 250c0-60 45-100 100-100s100 40 100 100" />
          <path d="M320 150v-40M310 110h20" />
          {[230, 260, 290, 350, 380, 410].map((x) => <path key={x} d={`M${x} 262v60`} />)}
        </g>
      )}
      {motif === 1 && (
        <g fill="none" stroke={lines} strokeWidth="1.5">
          {[60, 110, 160].map((ry) => <ellipse key={ry} cx="320" cy="250" rx="200" ry={ry} />)}
          {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx="320" cy="250" rx={40 + i * 40} ry="160" />)}
        </g>
      )}
      {motif === 2 && (
        <g fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M40 ${330 - r(5, 40)} L140 ${300 - r(7, 50)} L220 ${310 - r(11, 40)} L320 ${240 - r(15, 50)} L420 ${260 - r(17, 40)} L520 ${190 - r(19, 50)} L610 ${170 - r(21, 40)}`} stroke="#fff" opacity="0.9" />
          {[100, 180, 260, 340].map((y) => <path key={y} d={`M0 ${y}H640`} stroke={lines} strokeWidth="1" />)}
        </g>
      )}
      {motif === 3 && (
        <g fill="none" stroke="#fff" strokeWidth="1.8" opacity="0.6">
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${60 + i * 95} 400V${300 - (i % 3) * 30}h${40 + r(i, 30)}v-${40 + r(i + 2, 40)}`} />)}
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={`c${i}`} cx={100 + i * 95 + r(i, 30)} cy={260 - (i % 3) * 30 - r(i + 2, 40)} r="4" fill="#c8a24a" stroke="none" />)}
        </g>
      )}
      {motif === 4 && (
        <g fill="none" stroke={lines} strokeWidth="2">
          <rect x="60" y="230" width="520" height="150" />
          <path d="M320 230v150" />
          <circle cx="320" cy="305" r="40" />
          {[110, 160, 210, 430, 480, 530].map((x) => <path key={x} d={`M${x} 230v150`} strokeDasharray="4 8" />)}
        </g>
      )}
      {motif === 5 && (
        <g>
          <path d="M80 400 L160 230 H480 L560 400Z" fill="rgb(255 255 255 / 0.06)" />
          <path d="M140 230 Q320 180 500 230" fill="none" stroke="#fff" strokeWidth="2" opacity="0.5" />
          {[200, 280, 360, 440].map((x) => <path key={x} d={`M${x} 230 L${x - 40} 400`} stroke={lines} strokeWidth="1.5" />)}
        </g>
      )}
      {motif === 6 && (
        <g fill="none" stroke={lines} strokeWidth="1.6">
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M-20 ${250 + i * 26} C 160 ${200 + i * 26 - r(i, 40)}, 360 ${300 + i * 22}, 660 ${230 + i * 26}`} />)}
        </g>
      )}
      <rect y="396" width="640" height="4" fill="#c8a24a" />
    </svg>
  );
}

/** An editor's photo with its credit line; a blurred preview holds the space while it loads. */
function StoryPhotoView({ photo, className, width, priority }: { photo: StoryPhoto; className: string; width: number; priority?: boolean }) {
  return (
    <span className="relative block h-full w-full overflow-hidden bg-navy" style={photo.blur ? { backgroundImage: `url(${photo.blur})`, backgroundSize: "cover" } : undefined}>
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
      {photo.credit && <span className="absolute right-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] text-white/85">{photo.credit}</span>}
    </span>
  );
}
