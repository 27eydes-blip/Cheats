import "server-only";
import { buildProfile, profileToPrompt } from "@/lib/handwriting/profile";
import { resolveMarkers } from "@/lib/handwriting/markers";
import type { NotesPageForQuiz, SubjectContext } from "@/lib/ai/types";
import { HttpError, type DB } from "./api";

export async function loadNoteContext(supabase: DB, noteId: string) {
  const { data: note, error } = await supabase
    .from("notes")
    .select("id, title, class_id, topic_id, status, classes(name, subject), topics(name)")
    .eq("id", noteId)
    .maybeSingle();
  if (error) throw error;
  if (!note) throw new HttpError(404, "Notes not found.");
  const subject: SubjectContext = {
    className: note.classes?.name ?? null,
    subject: note.classes?.subject ?? null,
    topicName: note.topics?.name ?? null,
  };
  return { note, subject };
}

/** Prompt text describing the student's handwriting, learned from past fixes. */
export async function loadHandwritingProfile(supabase: DB, userId: string, classId: string | null) {
  const { data } = await supabase
    .from("handwriting_corrections")
    .select("original, corrected, class_id, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  return profileToPrompt(buildProfile(data ?? [], classId));
}

export async function loadPagesForQuiz(supabase: DB, noteId: string): Promise<NotesPageForQuiz[]> {
  const { data, error } = await supabase
    .from("note_pages")
    .select("page_index, text, raw_text, focus")
    .eq("note_id", noteId)
    .order("page_index");
  if (error) throw error;
  const pages = (data ?? [])
    .map((p) => ({
      pageIndex: p.page_index,
      text: (p.text ?? resolveMarkers(p.raw_text ?? "")).trim(),
      focusQuotes: Array.isArray(p.focus)
        ? (p.focus as { quote?: string }[]).map((f) => f?.quote).filter((q): q is string => !!q)
        : [],
    }))
    .filter((p) => p.text.length > 0);
  if (!pages.length) throw new HttpError(422, "These notes don't have any text yet. Read the pages first.");
  return pages;
}

export function blobToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}
