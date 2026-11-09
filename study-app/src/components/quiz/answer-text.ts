import type { Question } from "@/lib/quiz/schema";

/** The correct answer as plain text (for flashcard backs and reviews). */
export function answerText(q: Question): string {
  switch (q.type) {
    case "multiple_choice":
      return q.data.choices[q.data.answer_index] ?? "";
    case "flashcard":
      return q.data.back;
    case "fill_blank":
      return q.data.answer;
    case "true_false":
      return q.data.answer ? "True" : "False";
    case "short_answer":
      return q.data.answer;
    case "matching":
      return q.data.pairs.map((p) => `${p.left} → ${p.right}`).join("\n");
  }
}

/** Front side when any question is shown as a flashcard. */
export function cardFront(q: Question): string {
  switch (q.type) {
    case "flashcard":
      return q.data.front;
    case "multiple_choice":
    case "short_answer":
    case "matching":
      return q.data.prompt;
    case "fill_blank":
      return q.data.prompt;
    case "true_false":
      return `True or false: ${q.data.statement}`;
  }
}
