import { useId } from "react";

/**
 * The Gleyde mark: a sharp Art Deco diamond (double frame) around a
 * geometric "G", with a deco spine through the top and bottom points.
 *
 * Every stroke uses pathLength="1" so it can draw itself in with the
 * `.draw-path` CSS animation (set `animated`). Delays are staggered per
 * stroke so the frame appears first, then the G, then the details.
 *
 * Geometry (viewBox 120×160): centre (60,80); G radius 22.
 */

interface GleydeMarkProps {
  className?: string;
  /** Draw the strokes in on mount (CSS, runs before hydration). */
  animated?: boolean;
  /** Base delay before drawing starts, in seconds. */
  delay?: number;
  /** Accessible label. Pass "" to mark the SVG as decorative. */
  title?: string;
  strokeWidth?: number;
}

/** Each stroke of the mark with its relative draw delay (seconds). */
const strokes: { d: string; at: number; width?: number }[] = [
  // Outer diamond
  { d: "M60 3 L117 80 L60 157 L3 80 Z", at: 0 },
  // Inner diamond (hairline)
  { d: "M60 15 L105 80 L60 145 L15 80 Z", at: 0.35, width: 0.6 },
  // The G: a 315° arc from upper right, round the left, back to the right…
  { d: "M75.56 64.44 A22 22 0 1 0 82 80", at: 0.8, width: 1.6 },
  // …and its crossbar
  { d: "M82 80 L63 80", at: 1.6, width: 1.6 },
  // Deco spine above and below the G
  { d: "M60 22 L60 52", at: 1.2, width: 0.6 },
  { d: "M60 108 L60 138", at: 1.2, width: 0.6 },
  // Side ticks at the inner points
  { d: "M22 80 L32 80", at: 1.4, width: 0.6 },
  { d: "M88 80 L98 80", at: 1.4, width: 0.6 },
];

export function GleydeMark({
  className,
  animated = false,
  delay = 0,
  title = "Gleyde Technologies",
  strokeWidth = 1.2,
}: GleydeMarkProps) {
  const gradientId = `gleyde-gold-${useId().replace(/:/g, "")}`;
  const decorative = title === "";

  return (
    <svg
      viewBox="0 0 120 160"
      fill="none"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="120" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E6C97A" />
          <stop offset="0.5" stopColor="#C9A24B" />
          <stop offset="1" stopColor="#E6C97A" />
        </linearGradient>
      </defs>
      <g
        stroke={`url(#${gradientId})`}
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeMiterlimit={12}
      >
        {strokes.map((s) => (
          <path
            key={s.d}
            d={s.d}
            pathLength={1}
            strokeWidth={(s.width ?? 1) * strokeWidth}
            className={animated ? "draw-path" : undefined}
            style={animated ? { animationDelay: `${delay + s.at}s` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
