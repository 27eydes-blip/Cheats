/**
 * Holographic HUD rings drawn around the hero mark: a dashed outer orbit,
 * a tick-mark dial, sweeping arc segments, a fine inner ring, a slow radar
 * sweep and a breathing core glow. Pure SVG + CSS (rotation and fades run on
 * the compositor), so it costs almost nothing and needs no JavaScript.
 *
 * Each layer powers up in turn on load (`.hud-in` with staggered delays),
 * then rotates at its own speed. Reduced motion: static, fully visible.
 */

const C = 300; // centre of the 600×600 viewBox

/** Polar → cartesian helper (degrees, 0 = up, clockwise). */
function pt(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
}

/** SVG arc path on radius r from a to b degrees. */
function arc(r: number, a: number, b: number) {
  const large = b - a > 180 ? 1 : 0;
  return `M${pt(r, a)} A${r} ${r} 0 ${large} 1 ${pt(r, b)}`;
}

// Dial ticks every 6°, longer every 30°.
const ticks = Array.from({ length: 60 }, (_, i) => {
  const deg = i * 6;
  const long = i % 5 === 0;
  return `M${pt(252, deg)} L${pt(long ? 236 : 245, deg)}`;
}).join(" ");

// Reticle marks at N / E / S / W, just outside the rings.
const reticle = [0, 90, 180, 270].map((d) => `M${pt(296, d)} L${pt(278, d)}`).join(" ");

export function HudRings({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      {/* Breathing core glow behind the mark */}
      <div className="hud-in absolute inset-[30%]" style={{ animationDelay: "0.2s" }}>
        <div className="hud-breathe size-full rounded-full bg-[radial-gradient(closest-side,rgba(239,227,196,0.22),rgba(216,200,160,0.06)_55%,transparent_75%)]" />
      </div>

      {/* Radar sweep */}
      <div
        className="hud-in absolute inset-[9%] overflow-hidden rounded-full"
        style={{ animationDelay: "1.4s" }}
      >
        <div className="hud-spin-fast absolute inset-0 bg-[conic-gradient(from_0deg,rgba(239,227,196,0.08),transparent_12%,transparent)]" />
      </div>

      <svg viewBox="0 0 600 600" className="absolute inset-0 size-full overflow-visible" fill="none">
        {/* Outer dashed orbit (slow) */}
        <g className="hud-in" style={{ animationDelay: "0.35s" }}>
          <g className="hud-spin-slow">
          <circle cx={C} cy={C} r={284} stroke="#D8C8A0" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 7" />
          </g>
        </g>
        {/* Tick-mark dial (counter-rotating) */}
        <g className="hud-in" style={{ animationDelay: "0.55s" }}>
          <g className="hud-spin-rev">
          <path d={ticks} stroke="#EFE3C4" strokeOpacity="0.45" strokeWidth="1" />
          <circle cx={C} cy={C} r={256} stroke="#D8C8A0" strokeOpacity="0.18" strokeWidth="0.8" />
          </g>
        </g>
        {/* Sweeping arc segments (faster) */}
        <g className="hud-in" style={{ animationDelay: "0.8s" }}>
          <g className="hud-spin-mid">
          <path
            d={`${arc(218, 10, 80)} ${arc(218, 130, 200)} ${arc(218, 250, 320)}`}
            stroke="#EFE3C4"
            strokeOpacity="0.7"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d={`${arc(206, 95, 115)} ${arc(206, 215, 235)} ${arc(206, 335, 355)}`} stroke="#D8C8A0" strokeOpacity="0.5" strokeWidth="1" />
          </g>
        </g>
        {/* Fine inner ring */}
        <g className="hud-in" style={{ animationDelay: "1s" }}>
          <circle cx={C} cy={C} r={186} stroke="#D8C8A0" strokeOpacity="0.22" strokeWidth="0.8" />
        </g>
        {/* Static reticle marks */}
        <g className="hud-in" style={{ animationDelay: "1.2s" }}>
          <path d={reticle} stroke="#EFE3C4" strokeOpacity="0.6" strokeWidth="1.2" />
        </g>
      </svg>
    </div>
  );
}
