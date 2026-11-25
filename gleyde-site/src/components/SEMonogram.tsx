/**
 * Sam Eyde III's personal mark: a gold Cinzel "SE" with three Roman numeral
 * I's (with serifs) standing through the middle. No crown.
 *
 * Used as the hidden easter egg in the footer.
 */
export function SEMonogram({ className }: { className?: string }) {
  // x positions of the three I's, centred between the S and the E.
  const bars = [43, 50, 57];

  return (
    <svg viewBox="0 0 100 64" className={className} role="img" aria-label="SE III monogram">
      <defs>
        <linearGradient id="se-gold" x1="0" y1="0" x2="100" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E6C97A" />
          <stop offset="0.55" stopColor="#C9A24B" />
          <stop offset="1" stopColor="#E6C97A" />
        </linearGradient>
      </defs>
      <g fill="url(#se-gold)">
        <text
          x="26"
          y="50"
          textAnchor="middle"
          fontSize="50"
          fontWeight="600"
          className="font-display"
        >
          S
        </text>
        <text
          x="75"
          y="50"
          textAnchor="middle"
          fontSize="50"
          fontWeight="600"
          className="font-display"
        >
          E
        </text>
      </g>
      {/* The III: three upright strokes with Roman serifs top and bottom. */}
      <g stroke="url(#se-gold)" strokeLinecap="square">
        {bars.map((x) => (
          <g key={x}>
            <line x1={x} y1="8" x2={x} y2="56" strokeWidth="2.4" />
            <line x1={x - 2.6} y1="8" x2={x + 2.6} y2="8" strokeWidth="1.2" />
            <line x1={x - 2.6} y1="56" x2={x + 2.6} y2="56" strokeWidth="1.2" />
          </g>
        ))}
      </g>
    </svg>
  );
}
