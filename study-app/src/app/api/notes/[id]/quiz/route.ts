import { NextResponse } from "next/server";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { assertWithinLimit, recordUsage } from "@/lib/entitlements";
import { QUESTION_TYPES, validateQuestionData } from "@/lib/quiz/schema";
import { handler, readJson, requireUser } from "@/lib/server/api";
import type { Json } from "@/lib/supabase/database.types";
import { loadNoteContext, loadPagesForQuiz } from "@/lib/server/notes";

export const maxDuration = 300;

const Body = z.object({
  types: z.array(z.enum(QUESTION_TYPES)).min(1).default([...QUESTION_TYPES]),
  count: z.number().int().min(3).max(100).default(15),
  instructions: z.string().max(500).optional(),
});

/** Generates a quiz set (concepts + questions) from a note's corrected text. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson(req, (v) => Body.parse(v));
  const { supabase, user } = await requireUser();
  const { note, subject } = await loadNoteContext(supabase, id);
  const limits = await assertWithinLimit(supabase, user.id, "quiz_generate");
  const pages = await loadPagesForQuiz(supabase, id);
  const questionCount = Math.min(body.count, limits.maxQuestionsPerQuiz);

  const { data: set, error: setErr } = await supabase
    .from("quiz_sets")
    .insert({
      owner_id: user.id,
      note_id: id,
      class_id: note.class_id,
      topic_id: note.topic_id,
      title: note.title,
      status: "generating",
    })
    .select("id")
    .single();
  if (setErr) throw setErr;

  try {
    const quiz = await getAI().generateQuiz({
      pages,
      subject,
      types: body.types,
      questionCount,
      instructions: body.instructions,
    });
    await recordUsage(supabase, user.id, "quiz_generate");

    const conceptIds: (string | null)[] = [];
    if (quiz.concepts.length) {
      const { data: concepts, error } = await supabase
        .from("concepts")
        .insert(
          quiz.concepts.map((c) => ({
            owner_id: user.id,
            quiz_set_id: set.id,
            kind: c.kind,
            term: c.term.slice(0, 300),
            detail: c.detail.slice(0, 2000),
            page_index: c.page,
            quote: c.quote,
          })),
        )
        .select("id");
      if (error) throw error;
      conceptIds.push(...concepts.map((c) => c.id));
    }

    const rows = quiz.questions
      .filter((q) => body.types.includes(q.type))
      .map((q) => ({ q, v: validateQuestionData(q.type, q.data) }))
      .filter((x) => x.v.ok)
      .slice(0, questionCount)
      .map(({ q, v }, position) => ({
        owner_id: user.id,
        quiz_set_id: set.id,
        concept_id: q.conceptIndex != null ? (conceptIds[q.conceptIndex] ?? null) : null,
        position,
        type: q.type,
        data: (v as { data: Json }).data as NonNullable<Json>,
        explanation: q.explanation || null,
        difficulty: q.difficulty,
        source_page: q.sourcePage,
        source_quote: q.sourceQuote,
        is_focus: q.isFocus,
      }));
    if (!rows.length) throw new Error("The AI couldn't make questions from these notes.");
    const { error: qErr } = await supabase.from("questions").insert(rows);
    if (qErr) throw qErr;

    await supabase
      .from("quiz_sets")
      .update({ status: "ready", title: (quiz.title || note.title).slice(0, 200) })
      .eq("id", set.id);
    await supabase.from("notes").update({ status: "ready" }).eq("id", id);
    return NextResponse.json({ quizSetId: set.id, questionCount: rows.length });
  } catch (err) {
    await supabase.from("quiz_sets").update({ status: "error" }).eq("id", set.id);
    throw err;
  }
});
