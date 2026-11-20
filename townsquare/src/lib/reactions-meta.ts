/** The five WorldNet reactions (client-safe). */
export const REACTIONS = [
  { key: "fire", label: "Fire", emoji: "🔥" },
  { key: "mindblown", label: "Mind Blown", emoji: "🤯" },
  { key: "respect", label: "Respect", emoji: "🫡" },
  { key: "facepalm", label: "Facepalm", emoji: "🤦" },
  { key: "facts", label: "Facts", emoji: "💯" },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]["key"];
export const isReaction = (k: string): k is ReactionKind => REACTIONS.some((r) => r.key === k);
export const reactionMeta = (k: string) => REACTIONS.find((r) => r.key === k);
