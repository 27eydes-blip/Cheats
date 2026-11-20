/**
 * Profile accents and Beat chip colors. Client-safe. Everything stays in the
 * house blue/cyan family; the older accent keys are kept so saved profiles still load.
 */
export const ACCENTS = {
  blue: { label: "Electric blue", color: "#2f6bff", ink: "#7fa3ff" },
  cyan: { label: "Cyan", color: "#22d3ee", ink: "#67e8f9" },
  violet: { label: "Sky", color: "#38bdf8", ink: "#7dd3fc" },
  emerald: { label: "Ice", color: "#93b4ff", ink: "#bcd0ff" },
  amber: { label: "Deep blue", color: "#1e4fd6", ink: "#7fa3ff" },
  rose: { label: "Steel", color: "#6f86b3", ink: "#a9b9d8" },
} as const;
export type Accent = keyof typeof ACCENTS;
export const isAccent = (a: string): a is Accent => a in ACCENTS;

export const BEATS = {
  politics: { label: "Politics", color: "#7fa3ff" },
  markets: { label: "Markets", color: "#7fa3ff" },
  sports: { label: "Sports", color: "#7fa3ff" },
  tech: { label: "Tech", color: "#7fa3ff" },
  world: { label: "World", color: "#7fa3ff" },
  culture: { label: "Culture", color: "#7fa3ff" },
  national: { label: "National", color: "#7fa3ff" },
  science: { label: "Science", color: "#7fa3ff" },
  health: { label: "Health", color: "#7fa3ff" },
  courts: { label: "Courts", color: "#7fa3ff" },
  energy: { label: "Energy", color: "#7fa3ff" },
  media: { label: "Media", color: "#7fa3ff" },
} as const;
export type Beat = keyof typeof BEATS;
export const MAX_BEATS = 6;
