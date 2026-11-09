import { z } from "zod";
import { CONCEPT_KINDS, QUESTION_TYPES } from "@/lib/quiz/schema";

/**
 * Output schemas the model must follow (structured outputs). They are kept
 * plain (no defaults or length limits) so they convert cleanly to JSON
 * Schema; the app re-validates every question with the stricter schemas in
 * src/lib/quiz/schema.ts and drops anything malformed.
 */

export const ReadPageOutput = z.object({
  text: z.string(),
  focus_quotes: z.array(z.string()),
  suggested_title: z.string(),
  legibility: z.enum(["clear", "messy", "very_messy"]),
});
export type ReadPageOutput = z.infer<typeof ReadPageOutput>;

const PayloadMC = z.object({ prompt: z.string(), choices: z.array(z.string()), answer_index: z.number().int() });
const PayloadFlash = z.object({ front: z.string(), back: z.string() });
const PayloadFill = z.object({ prompt: z.string(), answer: z.string(), accepted_answers: z.array(z.string()) });
const PayloadTF = z.object({ statement: z.string(), answer: z.boolean() });
const PayloadShort = z.object({ prompt: z.string(), answer: z.string(), key_points: z.array(z.string()) });
const PayloadMatch = z.object({
  prompt: z.string(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })),
});

export const QuestionOutput = z.object({
  type: z.enum(QUESTION_TYPES),
  data: z.union([PayloadMC, PayloadFlash, PayloadFill, PayloadTF, PayloadShort, PayloadMatch]),
  explanation: z.string(),
  difficulty: z.number().int(),
  concept_index: z.number().int().nullable(),
  source_page: z.number().int().nullable(),
  source_quote: z.string().nullable(),
  is_focus: z.boolean(),
});
export type QuestionOutput = z.infer<typeof QuestionOutput>;

export const QuizOutput = z.object({
  title: z.string(),
  concepts: z.array(
    z.object({
      kind: z.enum(CONCEPT_KINDS),
      term: z.string(),
      detail: z.string(),
      page: z.number().int().nullable(),
      quote: z.string().nullable(),
    }),
  ),
  questions: z.array(QuestionOutput),
});
export type QuizOutput = z.infer<typeof QuizOutput>;

export const SingleQuestionOutput = z.object({ question: QuestionOutput });

export const ReadAnswerOutput = z.object({ text: z.string() });
