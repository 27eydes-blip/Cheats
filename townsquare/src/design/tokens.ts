/**
 * Typed mirror of src/styles/tokens.css for code that needs values in JS
 * (motion durations, chart colors). CSS variables stay the source of truth.
 */
export const motion = {
  micro: 120,
  std: 220,
  emph: 380,
  spring: "cubic-bezier(0.2, 0.9, 0.25, 1.15)",
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export const color = {
  accent: "var(--accent)",
  accentGrad: "var(--accent-grad)",
  breaking: "var(--breaking)",
  live: "var(--live)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
} as const;

export const severityColor = {
  critical: "var(--breaking)",
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--ink-3)",
} as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Tailwind breakpoints used by the shell. */
export const bp = { tablet: 640, desktop: 1024, wide: 1280 } as const;
