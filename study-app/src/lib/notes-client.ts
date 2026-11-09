"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { api } from "@/lib/data";

/** A page waiting to be saved: a cleaned photo/scan/ink page, or slide text. */
export interface DraftPage {
  id: string;
  /** Final image to upload (cleaned + any focus marks). Null for text-only slides. */
  blob: Blob | null;
  previewUrl: string | null;
  sourceText?: string;
  hasFocusMarks?: boolean;
}

export type NoteSource = "camera" | "upload" | "pdf" | "slides" | "ink" | "text";

const inflight = new Set<string>();

/** Reads pages with the AI, a few at a time. Safe to call twice (deduped). */
export async function readPages(noteId: string, pages: { index: number; marks?: boolean }[], concurrency = 3) {
  const queue = pages.filter((p) => !inflight.has(`${noteId}:${p.index}`));
  for (const p of queue) inflight.add(`${noteId}:${p.index}`);
  const errors: string[] = [];
  const work = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        await api(`/api/notes/${noteId}/pages/${p.index}/read${p.marks ? "?marks=1" : ""}`);
      } catch (e) {
        errors.push((e as Error).message);
      } finally {
        inflight.delete(`${noteId}:${p.index}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, work));
  return errors;
}

export function isReading(noteId: string, index: number) {
  return inflight.has(`${noteId}:${index}`);
}

/**
 * Saves a capture as a note: creates the note, uploads each page into the
 * student's private folder, then starts reading in the background.
 */
export async function createNoteFromPages(
  pages: DraftPage[],
  meta: { classId: string | null; topicId: string | null; title?: string; source: NoteSource },
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const sb = supabaseBrowser();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Please sign in first.");
  if (!pages.length) throw new Error("Add at least one page.");

  const { data: note, error } = await sb
    .from("notes")
    .insert({
      class_id: meta.classId,
      topic_id: meta.topicId,
      title: meta.title?.trim() || "Untitled notes",
      source: meta.source,
      status: "reading",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  let done = 0;
  await Promise.all(
    pages.map(async (p, index) => {
      let image_path: string | null = null;
      if (p.blob) {
        image_path = `${uid}/${note.id}/${index}-${crypto.randomUUID().slice(0, 8)}.jpg`;
        const up = await sb.storage.from("note-pages").upload(image_path, p.blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      }
      const ins = await sb.from("note_pages").insert({
        note_id: note.id,
        page_index: index,
        image_path,
        source_text: p.sourceText ?? null,
      });
      if (ins.error) throw new Error(ins.error.message);
      onProgress?.(++done, pages.length);
    }),
  );

  // Don't await: the review screen shows progress live as pages finish.
  void readPages(
    note.id,
    pages.map((p, index) => ({ index, marks: p.hasFocusMarks })),
  );
  return note.id;
}
