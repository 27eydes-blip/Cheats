import { useId } from "react";
import { DIAMOND, G_PATH, markStops, RAYS, RING } from "@/lib/brand";

/**
 * The Gleyde mark: a sharp Art Deco diamond around a medallion "G" with a
 * fine Gatsby sunburst. Geometry lives in src/lib/brand.ts.
 *
 * `animated`: the diamond draws itself in, then the ring, then the rays
 * fan out one by one, and finally the G fades up. Pure CSS (pathLength="1"
 * + the .draw-path animation), so it starts before JavaScript loads.
 *
 * `compact`: for small sizes (nav, footer). Drops the rays and thickens the
 * strokes so the mark stays crisp at ~28px.
 */

interface GleydeMarkProps {
  className?: string;
  animated?: boolean;
  /** Base delay before drawing starts, in seconds. */
  delay?: number;
  /** Accessible label. Pass "" to mark the SVG as decorative. */
  title?: string;
  compact?: boolean;
}

export function GleydeMark({
  className,
  animated = false,
  delay = 0,
  title = "Gleyde Technologies",
  compact = false,
}: GleydeMarkProps) {
  const gradientId = `gleyde-${useId().replace(/:/g, "")}`;
  const decorative = title === "";
  const draw = (at: number) =>
    animated ? { className: "draw-path", style: { animationDelay: `${delay + at}s` } } : {};

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
          <stop offset="0" stopColor={markStops[0]} />
          <stop offset="0.5" stopColor={markStops[1]} />
          <stop offset="1" stopColor={markStops[2]} />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gradientId})`} strokeLinecap="butt" strokeMiterlimit={12}>
        <path d={DIAMOND} pathLength={1} strokeWidth={compact ? 5 : 1} {...draw(0)} />
        <circle
          cx={RING.cx}
          cy={RING.cy}
          r={compact ? 31 : RING.r}
          pathLength={1}
          strokeWidth={compact ? 4.5 : 0.8}
          // Start the ring's stroke at 12 o'clock so it draws round like a clock hand.
          transform={`rotate(-90 ${RING.cx} ${RING.cy})`}
          {...draw(0.7)}
        />
        {!compact &&
          RAYS.map((d, i) => <path key={d} d={d} pathLength={1} strokeWidth={0.5} {...draw(1.2 + i * 0.05)} />)}
      </g>
      <path
        d={G_PATH}
        fill={`url(#${gradientId})`}
        className={animated ? "fade-in" : undefined}
        style={animated ? { animationDelay: `${delay + 1.3}s` } : undefined}
      />
    </svg>
  );
}
