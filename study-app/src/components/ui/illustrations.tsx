import clsx from "clsx";

export type IllustrationKind = "notes" | "quiz" | "library" | "lost" | "camera";

/**
 * Hand-built line illustrations for empty states. Strokes use the text color,
 * highlights use the accent, so they work in light and dark mode.
 */
export function Illustration({ kind, className }: { kind: IllustrationKind; className?: string }) {
  const stroke = { stroke: "var(--fg-2)", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const paper = { fill: "var(--bg-elev)", stroke: "var(--fg-2)", strokeWidth: 2, strokeLinejoin: "round" as const };
  const accent = "var(--accent)";
  return (
    <svg viewBox="0 0 200 150" className={clsx("h-auto", className)} aria-hidden>
      <ellipse cx="100" cy="138" rx="70" ry="7" fill="var(--fg)" opacity="0.06" />
      <circle cx="100" cy="72" r="58" fill={accent} opacity="0.12" />
      {kind === "notes" && (
        <g className="animate-float">
          <rect x="62" y="34" width="70" height="90" rx="8" transform="rotate(-8 97 79)" {...paper} />
          <rect x="70" y="28" width="70" height="90" rx="8" {...paper} />
          <path d="M82 50h40M82 62h46M82 74h30M82 86h38" {...stroke} />
          <rect x="80" y="70" width="34" height="9" rx="3" fill={accent} opacity="0.85" />
          <path d="M150 22l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={accent} stroke="var(--fg-2)" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      )}
      {kind === "quiz" && (
        <g className="animate-float">
          <rect x="52" y="40" width="74" height="84" rx="10" transform="rotate(-10 89 82)" {...paper} />
          <rect x="74" y="30" width="74" height="84" rx="10" {...paper} />
          <path d="M88 50h44" {...stroke} />
          {[64, 80, 96].map((y, i) => (
            <g key={y}>
              <rect x="86" y={y - 6} width="50" height="12" rx="6" fill={i === 1 ? accent : "none"} stroke="var(--fg-2)" strokeWidth="2" />
              {i === 1 && <path d={`M${92} ${y}l3 3 6-6`} stroke="var(--accent-fg)" strokeWidth="2" fill="none" strokeLinecap="round" />}
            </g>
          ))}
        </g>
      )}
      {kind === "library" && (
        <g className="animate-float">
          <rect x="56" y="40" width="18" height="80" rx="4" {...paper} />
          <rect x="78" y="30" width="20" height="90" rx="4" fill={accent} stroke="var(--fg-2)" strokeWidth="2" />
          <rect x="102" y="46" width="16" height="74" rx="4" {...paper} />
          <rect x="124" y="38" width="20" height="82" rx="4" transform="rotate(10 134 79)" {...paper} />
          <path d="M62 56h6M84 48h8M84 56h8M107 62h6" {...stroke} />
          <path d="M44 120h112" {...stroke} />
        </g>
      )}
      {kind === "lost" && (
        <g className="animate-float">
          <rect x="62" y="34" width="70" height="88" rx="8" {...paper} strokeDasharray="5 6" />
          <circle cx="118" cy="88" r="20" fill="var(--bg-elev)" stroke="var(--fg-2)" strokeWidth="2.5" />
          <path d="m132 102 14 14" stroke="var(--fg-2)" strokeWidth="5" strokeLinecap="round" />
          <path d="M113 83c0-4 10-4 10 0 0 3-5 3-5 7M118 95h.01" {...stroke} />
        </g>
      )}
      {kind === "camera" && (
        <g className="animate-float">
          <rect x="54" y="48" width="92" height="66" rx="14" {...paper} />
          <path d="M80 48l6-10h28l6 10" {...paper} />
          <circle cx="100" cy="81" r="20" fill={accent} stroke="var(--fg-2)" strokeWidth="2" />
          <circle cx="100" cy="81" r="9" fill="var(--bg-elev)" stroke="var(--fg-2)" strokeWidth="2" />
          <path d="M132 60h.01" {...stroke} strokeWidth="4" />
        </g>
      )}
    </svg>
  );
}
