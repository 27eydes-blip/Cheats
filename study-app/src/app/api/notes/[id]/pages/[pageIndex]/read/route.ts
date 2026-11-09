import { NextResponse } from "next/server";
import { getAI } from "@/lib/ai";
import type { ImageInput } from "@/lib/ai/types";
import { assertWithinLimit, recordUsage } from "@/lib/entitlements";
import { handler, HttpError, requireUser } from "@/lib/server/api";
import { blobToBase64, loadHandwritingProfile, loadNoteContext } from "@/lib/server/notes";

export const maxDuration = 300;

/**
 * Reads one page of notes with the AI. The image comes from the student's
 * private storage folder; the class/topic and their handwriting profile are
 * passed to the model as context.
 */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string; pageIndex: string }> }) => {
  const { id, pageIndex } = await ctx.params;
  const index = Number.parseInt(pageIndex, 10);
  if (!Number.isInteger(index) || index < 0) throw new HttpError(400, "Bad page number.");
  const hasFocusMarks = new URL(req.url).searchParams.get("marks") === "1";

  const { supabase, user } = await requireUser();
  const { note, subject } = await loadNoteContext(supabase, id);
  await assertWithinLimit(supabase, user.id, "page_read");

  const { data: page } = await supabase
    .from("note_pages")
    .select("id, image_path, source_text")
    .eq("note_id", id)
    .eq("page_index", index)
    .maybeSingle();
  if (!page) throw new HttpError(404, "Page not found.");
  const { count: pageCount } = await supabase
    .from("note_pages")
    .select("id", { count: "exact", head: true })
    .eq("note_id", id);

  await supabase.from("note_pages").update({ status: "reading", error: null }).eq("id", page.id);
  await supabase.from("notes").update({ status: "reading" }).eq("id", id);

  try {
    let image: ImageInput | undefined;
    if (page.image_path) {
      const { data: blob, error } = await supabase.storage.from("note-pages").download(page.image_path);
      if (error || !blob) throw new HttpError(404, "Page image is missing. Try uploading it again.");
      const type = blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg";
      image = { mediaType: type, base64: blobToBase64(await blob.arrayBuffer()) };
    }
    const handwritingProfile = await loadHandwritingProfile(supabase, user.id, note.class_id);
    const result = await getAI().readNotesPage({
      image,
      sourceText: page.source_text,
      subject,
      handwritingProfile,
      hasFocusMarks,
      pageNumber: index + 1,
      pageCount: pageCount ?? 1,
    });
    await recordUsage(supabase, user.id, "page_read");

    const { data: updated, error } = await supabase
      .from("note_pages")
      .update({
        raw_text: result.text,
        text: null,
        focus: result.focusQuotes.map((quote) => ({ quote, from: "marks" })),
        status: "done",
        model: result.model,
      })
      .eq("id", page.id)
      .select()
      .single();
    if (error) throw error;

    // Name untitled notes, and move to review once every page is read.
    const patch: { title?: string; status?: "review" } = {};
    if (note.title === "Untitled notes" && result.suggestedTitle) patch.title = result.suggestedTitle.slice(0, 120);
    const { count: pending } = await supabase
      .from("note_pages")
      .select("id", { count: "exact", head: true })
      .eq("note_id", id)
      .neq("status", "done");
    if (!pending) patch.status = "review";
    if (Object.keys(patch).length) await supabase.from("notes").update(patch).eq("id", id);

    return NextResponse.json({ page: updated, legibility: result.legibility });
  } catch (err) {
    await supabase
      .from("note_pages")
      .update({ status: "error", error: err instanceof Error ? err.message.slice(0, 300) : "Failed" })
      .eq("id", page.id);
    throw err;
  }
});
