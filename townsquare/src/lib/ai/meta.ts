/** Client-safe constants for the AI newsroom (no SDK, no database). */
export type Format = "quick_take" | "explainer" | "watch" | "question";
export const FORMATS: Format[] = ["quick_take", "explainer", "watch", "question"];
export const FORMAT_LABEL: Record<Format, string> = { quick_take: "Quick take", explainer: "Explainer", watch: "What to watch", question: "A question" };
