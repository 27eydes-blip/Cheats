export function Monogram({ size = 34 }: { size?: number }) {
  return (
    <span
      className="monogram"
      style={{ width: size, height: size, fontSize: size * 0.36, borderRadius: size * 0.28 }}
      aria-hidden="true"
    >
      SES
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo ${compact ? "compact" : ""}`}>
      <Monogram size={compact ? 30 : 44} />
      <span className="logo-word">
        Sam Eyde <b>Studios</b>
      </span>
    </span>
  );
}
