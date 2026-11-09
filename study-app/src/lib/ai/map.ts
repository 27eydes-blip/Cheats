import type { QuestionOutput } from "./schemas";
import type { GeneratedQuestion } from "./types";

/** Converts model output (1-based pages) to the app's shape (0-based pages). */
export function mapQuestion(q: QuestionOutput): GeneratedQuestion {
  return {
    type: q.type,
    data: q.data,
    explanation: q.explanation,
    difficulty: Math.min(3, Math.max(1, Math.round(q.difficulty || 2))),
    conceptIndex: q.concept_index,
    sourcePage: q.source_page == null ? null : Math.max(0, q.source_page - 1),
    sourceQuote: q.source_quote,
    isFocus: q.is_focus,
  };
}
