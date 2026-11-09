import { NextResponse } from "next/server";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { assertWithinLimit, recordUsage } from "@/lib/entitlements";
import { QUESTION_TYPES, validateQuestionData, type QuestionType } from "@/lib/quiz/schema";
import { handler, HttpError, readJson, requireUser } from "@/lib/server/api";
import type { Json } from "@/lib/supabase/database.types";
import { loadNoteContext, loadPagesForQuiz } from "@/lib/server/notes";

export const maxDuration = 120;

const Body = z.object({
  type: z.enum(QUESTION_TYPES).optional(),
  instructions: z.string().max(500).optional(),
});

/** Replaces one question with a fresh AI-written one (optionally a new type). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson(req, (v) => Body.parse(v));
  const { supabase, user } = await requireUser();

  const { data: q } = await supabase
    .from("questions")
    .select("id, type, data, source_page, source_quote, quiz_sets(note_id)")
    .eq("id", id)
    .maybeSingle();
  if (!q) throw new HttpError(404, "Question not found.");
  const noteId = q.quiz_sets?.note_id;
  if (!noteId) throw new HttpError(422, "The notes for this quiz were deleted, so it can't be regenerated.");

  await assertWithinLimit(supabase, user.id, "question_regenerate");
  const { subject } = await loadNoteContext(supabase, noteId);
  const pages = await loadPagesForQuiz(supabase, noteId);

  const fresh = await getAI().regenerateQuestion({
    pages,
    subject,
    current: { type: q.type as QuestionType, data: q.data, sourcePage: q.source_page, sourceQuote: q.source_quote },
    type: body.type,
    instructions: body.instructions,
  });
  await recordUsage(supabase, user.id, "question_regenerate");
  const v = validateQuestionData(fresh.type, fresh.data);
  if (!v.ok) throw new HttpError(422, "The AI's new question wasn't usable. Try again.");

  const { data: updated, error } = await supabase
    .from("questions")
    .update({
      type: v.type,
      data: v.data as NonNullable<Json>,
      explanation: fresh.explanation || null,
      difficulty: fresh.difficulty,
      source_page: fresh.sourcePage,
      source_quote: fresh.sourceQuote,
      is_focus: fresh.isFocus,
      edited: false,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return NextResponse.json({ question: updated });
});
