/** Profile accents (from the app palette) and Beat chip colors. Client-safe. */
export const ACCENTS = {
  blue: { label: "Electric blue", color: "#2f6bff", ink: "#7fa3ff" },
  cyan: { label: "Cyan", color: "#22d3ee", ink: "#67e8f9" },
  violet: { label: "Violet", color: "#8b5cf6", ink: "#c4b5fd" },
  emerald: { label: "Emerald", color: "#10b981", ink: "#6ee7b7" },
  amber: { label: "Amber", color: "#f59e0b", ink: "#fcd34d" },
  rose: { label: "Rose", color: "#f43f5e", ink: "#fda4af" },
} as const;
export type Accent = keyof typeof ACCENTS;
export const isAccent = (a: string): a is Accent => a in ACCENTS;

export const BEATS = {
  politics: { label: "Politics", color: "#ff5c73" },
  markets: { label: "Markets", color: "#34d399" },
  sports: { label: "Sports", color: "#fbbf24" },
  tech: { label: "Tech", color: "#a78bfa" },
  world: { label: "World", color: "#22d3ee" },
  culture: { label: "Culture", color: "#f472b6" },
  national: { label: "National", color: "#7fa3ff" },
  science: { label: "Science", color: "#5eead4" },
  health: { label: "Health", color: "#86efac" },
  courts: { label: "Courts", color: "#fdba74" },
  energy: { label: "Energy", color: "#facc15" },
  media: { label: "Media", color: "#93c5fd" },
} as const;
export type Beat = keyof typeof BEATS;
export const MAX_BEATS = 6;
