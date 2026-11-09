import { z } from "zod";

/** The question types the app supports. */
export const QUESTION_TYPES = [
  "multiple_choice",
  "flashcard",
  "fill_blank",
  "true_false",
  "short_answer",
  "matching",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  flashcard: "Flashcards",
  fill_blank: "Fill in the blank",
  true_false: "True or false",
  short_answer: "Short answer",
  matching: "Matching",
};

export const CONCEPT_KINDS = [
  "concept",
  "definition",
  "date",
  "formula",
  "vocabulary",
  "person",
  "process",
  "fact",
] as const;

// --- Per-type payloads (stored in questions.data) ---------------------------

export const MultipleChoiceData = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answer_index: z.number().int().min(0),
});
export const FlashcardData = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});
export const FillBlankData = z.object({
  /** Sentence with exactly one "____" where the answer goes. */
  prompt: z.string().min(1),
  answer: z.string().min(1),
  accepted_answers: z.array(z.string()).default([]),
});
export const TrueFalseData = z.object({
  statement: z.string().min(1),
  answer: z.boolean(),
});
export const ShortAnswerData = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1),
  /** Ideas a good answer must mention; used for grading. */
  key_points: z.array(z.string()).default([]),
});
export const MatchingData = z.object({
  prompt: z.string().min(1),
  pairs: z
    .array(z.object({ left: z.string().min(1), right: z.string().min(1) }))
    .min(2)
    .max(8),
});

export const QuestionDataByType = {
  multiple_choice: MultipleChoiceData,
  flashcard: FlashcardData,
  fill_blank: FillBlankData,
  true_false: TrueFalseData,
  short_answer: ShortAnswerData,
  matching: MatchingData,
} as const;

export type QuestionData = {
  multiple_choice: z.infer<typeof MultipleChoiceData>;
  flashcard: z.infer<typeof FlashcardData>;
  fill_blank: z.infer<typeof FillBlankData>;
  true_false: z.infer<typeof TrueFalseData>;
  short_answer: z.infer<typeof ShortAnswerData>;
  matching: z.infer<typeof MatchingData>;
};

export type Question = {
  [T in QuestionType]: {
    id: string;
    quiz_set_id: string;
    concept_id: string | null;
    position: number;
    type: T;
    data: QuestionData[T];
    explanation: string | null;
    difficulty: number;
    source_page: number | null;
    source_quote: string | null;
    is_focus: boolean;
    edited: boolean;
  };
}[QuestionType];

/** Validates a type + payload pair, returning a normalized payload or an error. */
export function validateQuestionData(
  type: string,
  data: unknown,
): { ok: true; type: QuestionType; data: QuestionData[QuestionType] } | { ok: false; error: string } {
  if (!(QUESTION_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: `Unknown question type: ${type}` };
  }
  const t = type as QuestionType;
  const parsed = QuestionDataByType[t].safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  if (t === "multiple_choice") {
    const d = parsed.data as QuestionData["multiple_choice"];
    if (d.answer_index >= d.choices.length) return { ok: false, error: "answer_index out of range" };
    if (new Set(d.choices.map((c) => c.trim().toLowerCase())).size !== d.choices.length) {
      return { ok: false, error: "choices must be distinct" };
    }
  }
  if (t === "fill_blank") {
    const d = parsed.data as QuestionData["fill_blank"];
    if (!d.prompt.includes("____")) return { ok: false, error: "fill_blank prompt needs a ____ blank" };
  }
  return { ok: true, type: t, data: parsed.data as QuestionData[QuestionType] };
}

/** Short human text for a question (used in lists and the editor). */
export type QuestionContent = { [T in QuestionType]: { type: T; data: QuestionData[T] } }[QuestionType];

export function questionHeadline(q: QuestionContent): string {
  switch (q.type) {
    case "multiple_choice":
    case "fill_blank":
    case "short_answer":
    case "matching":
      return q.data.prompt;
    case "flashcard":
      return q.data.front;
    case "true_false":
      return q.data.statement;
  }
}
