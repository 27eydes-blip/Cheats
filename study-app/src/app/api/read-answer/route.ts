import { NextResponse } from "next/server";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { assertWithinLimit, recordUsage } from "@/lib/entitlements";
import { handler, readJson, requireUser } from "@/lib/server/api";
import { loadHandwritingProfile } from "@/lib/server/notes";

export const maxDuration = 60;

const Body = z.object({
  /** PNG/JPEG of the handwritten answer, base64 without prefix, < ~2MB. */
  image: z.string().min(10).max(2_800_000),
  mediaType: z.enum(["image/png", "image/jpeg"]),
  questionPrompt: z.string().max(2000),
  classId: z.string().uuid().nullable().optional(),
});

/** Reads an Apple Pencil answer so it can be graded like a typed one. */
export const POST = handler(async (req: Request) => {
  const body = await readJson(req, (v) => Body.parse(v));
  const { supabase, user } = await requireUser();
  await assertWithinLimit(supabase, user.id, "answer_read");
  const handwritingProfile = await loadHandwritingProfile(supabase, user.id, body.classId ?? null);
  const { text } = await getAI().readHandwrittenAnswer({
    image: { mediaType: body.mediaType, base64: body.image },
    questionPrompt: body.questionPrompt,
    subject: {},
    handwritingProfile,
  });
  await recordUsage(supabase, user.id, "answer_read");
  return NextResponse.json({ text });
});
