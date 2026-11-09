/**
 * Plan definitions. Monetization isn't on yet: everyone is on "free" with
 * generous limits. To add a paid tier later, set limits here, flip
 * `profiles.plan` (e.g. from a Stripe webhook) and the checks in
 * src/lib/entitlements.ts do the rest; no other code needs to change.
 */
export type PlanId = "free" | "pro";

export type UsageKind = "page_read" | "quiz_generate" | "question_regenerate" | "answer_read";

export interface PlanLimits {
  /** AI calls allowed per rolling 24 hours, by kind. */
  daily: Record<UsageKind, number>;
  /** Max pages in one capture/upload. */
  maxPagesPerNote: number;
  /** Max questions per generated quiz. */
  maxQuestionsPerQuiz: number;
}

export const PLANS: Record<PlanId, { label: string; limits: PlanLimits }> = {
  free: {
    label: "Free",
    limits: {
      daily: { page_read: 200, quiz_generate: 60, question_regenerate: 300, answer_read: 300 },
      maxPagesPerNote: 30,
      maxQuestionsPerQuiz: 40,
    },
  },
  pro: {
    label: "Pro",
    limits: {
      daily: { page_read: 1000, quiz_generate: 300, question_regenerate: 1500, answer_read: 1500 },
      maxPagesPerNote: 100,
      maxQuestionsPerQuiz: 100,
    },
  },
};

export function limitsFor(plan: string | null | undefined): PlanLimits {
  return (PLANS[(plan as PlanId) ?? "free"] ?? PLANS.free).limits;
}
