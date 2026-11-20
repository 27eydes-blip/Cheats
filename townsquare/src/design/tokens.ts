/**
 * Typed mirror of src/styles/tokens.css for code that needs values in JS
 * (motion durations, chart colors). CSS variables stay the source of truth.
 */
export const motion = { micro: 120, std: 220, emph: 380, spring: "cubic-bezier(0.2, 0.9, 0.25, 1.15)", out: "cubic-bezier(0.16, 1, 0.3, 1)" } as const;

export const color = {
  navy: "var(--navy)",
  navyInk: "var(--navy-ink)",
  gold: "var(--gold)",
  goldInk: "var(--gold-ink)",
  live: "var(--live)",
  agree: "var(--agree)",
  disagree: "var(--disagree)",
  unsure: "var(--unsure)",
} as const;

/** Stance → token. Used by meters, chips, and byline portrait rings. */
export const stanceColor = {
  agree: "var(--agree)",
  disagree: "var(--disagree)",
  unsure: "var(--unsure)",
  context: "var(--gold)",
  question: "var(--navy-ink)",
} as const;

export const severityColor = { critical: "var(--live-bg)", high: "var(--disagree)", medium: "var(--warning)", low: "var(--ink-3)" } as const;
export const radius = { xs: 2, sm: 4, md: 6, lg: 8, xl: 8 } as const;
export const bp = { tablet: 640, desktop: 1024, wide: 1280 } as const;
