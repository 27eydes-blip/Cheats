"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Question } from "@/lib/quiz/schema";

/** Typed client-side data access. Everything is protected by RLS. */

type Tables = Database["public"]["Tables"];
export type ClassRow = Tables["classes"]["Row"];
export type TopicRow = Tables["topics"]["Row"];
export type NoteRow = Tables["notes"]["Row"];
export type NotePageRow = Tables["note_pages"]["Row"];
export type QuizSetRow = Tables["quiz_sets"]["Row"];
export type QuestionRow = Tables["questions"]["Row"];

const sb = () => supabaseBrowser();

function must<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R["data"]>;
}
function maybe<R extends { data: unknown; error: { message: string } | null }>(res: R): R["data"] {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const CLASS_COLORS = ["violet", "sky", "emerald", "amber", "rose", "indigo", "teal", "orange"] as const;
export const COLOR_SWATCH: Record<string, string> = {
  violet: "#8b5cf6",
  sky: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  indigo: "#6366f1",
  teal: "#14b8a6",
  orange: "#f97316",
};

export async function listClasses() {
  return must(await sb().from("classes").select("*, topics(*)").order("name"));
}

export async function createClass(name: string, subject?: string) {
  const color = CLASS_COLORS[Math.floor(Math.random() * CLASS_COLORS.length)];
  return must(
    await sb()
      .from("classes")
      .insert({ name: name.trim(), subject: subject?.trim() || null, color })
      .select()
      .single(),
  );
}

export async function renameClass(id: string, name: string) {
  must(await sb().from("classes").update({ name }).eq("id", id));
}
export async function deleteClass(id: string) {
  must(await sb().from("classes").delete().eq("id", id));
}

export async function createTopic(classId: string, name: string) {
  return must(await sb().from("topics").insert({ class_id: classId, name: name.trim() }).select().single());
}
export async function deleteTopic(id: string) {
  must(await sb().from("topics").delete().eq("id", id));
}

export async function listNotes(opts: { classId?: string; topicId?: string; limit?: number } = {}) {
  let q = sb()
    .from("notes")
    .select("*, classes(name, color), topics(name), note_pages(id, image_path, page_index)")
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.classId) q = q.eq("class_id", opts.classId);
  if (opts.topicId) q = q.eq("topic_id", opts.topicId);
  return must(await q);
}

export async function getNote(id: string) {
  return maybe(
    await sb()
      .from("notes")
      .select("*, classes(id, name, subject, color), topics(id, name), note_pages(*)")
      .eq("id", id)
      .order("page_index", { referencedTable: "note_pages" })
      .maybeSingle(),
  );
}

export async function updateNote(id: string, patch: Tables["notes"]["Update"]) {
  must(await sb().from("notes").update(patch).eq("id", id));
}
export async function deleteNote(id: string) {
  const note = await getNote(id);
  const paths = (note?.note_pages ?? []).map((p) => p.image_path).filter((p): p is string => !!p);
  if (paths.length) await sb().storage.from("note-pages").remove(paths);
  must(await sb().from("notes").delete().eq("id", id));
}

export async function updatePage(id: string, patch: Tables["note_pages"]["Update"]) {
  return must(await sb().from("note_pages").update(patch).eq("id", id).select().single());
}

export async function saveCorrections(
  rows: { original: string; corrected: string; context?: string; note_page_id: string; class_id: string | null }[],
) {
  const clean = rows
    .map((r) => ({ ...r, original: r.original.trim().slice(0, 200), corrected: r.corrected.trim().slice(0, 200) }))
    .filter((r) => r.original && r.corrected && r.original !== r.corrected);
  if (!clean.length) return;
  must(await sb().from("handwriting_corrections").insert(clean.map((r) => ({ ...r, context: r.context?.slice(0, 400) }))));
}

/** Short-lived signed URLs for private page images. */
export async function signedImageUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await sb().storage.from("note-pages").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export async function listQuizSets(opts: { limit?: number; classId?: string } = {}) {
  let q = sb()
    .from("quiz_sets")
    .select("*, classes(name, color), topics(name), questions(count)")
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.classId) q = q.eq("class_id", opts.classId);
  return must(await q);
}

export async function getQuizSet(id: string) {
  return maybe(
    await sb()
      .from("quiz_sets")
      .select("*, classes(id, name, color), topics(name), questions(*)")
      .eq("id", id)
      .order("position", { referencedTable: "questions" })
      .maybeSingle(),
  );
}

export async function updateQuizSet(id: string, patch: Tables["quiz_sets"]["Update"]) {
  must(await sb().from("quiz_sets").update(patch).eq("id", id));
}
export async function deleteQuizSet(id: string) {
  must(await sb().from("quiz_sets").delete().eq("id", id));
}

export async function updateQuestion(
  id: string,
  patch: { data?: NonNullable<Json>; explanation?: string | null; type?: string },
) {
  return must(
    await sb()
      .from("questions")
      .update({ ...patch, edited: true })
      .eq("id", id)
      .select()
      .single(),
  );
}
export async function deleteQuestion(id: string) {
  must(await sb().from("questions").delete().eq("id", id));
}

export function asQuestion(row: QuestionRow): Question {
  return row as unknown as Question;
}

/** POST to our API with JSON, throwing the server's friendly error message. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}
