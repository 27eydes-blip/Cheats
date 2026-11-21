"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { createNote, flagNote, rateNote, reviewNote } from "@/lib/notes/notes";
import { attempt } from "./result";

export async function createNoteAction(input: { targetType: string; targetId: string; body: string; sourceUrl: string }) {
  return attempt(async () => {
    const id = createNote(await requireViewer(), { targetType: String(input.targetType), targetId: String(input.targetId), body: String(input.body ?? ""), sourceUrl: String(input.sourceUrl ?? "") });
    revalidatePath(input.targetType === "story" ? `/news/story/${input.targetId}` : `/p/${input.targetId}`);
    return id;
  });
}
export async function rateNoteAction(noteId: string, value: string, reason: string) {
  return attempt(async () => {
    const status = rateNote(await requireViewer(), String(noteId), String(value), String(reason));
    revalidatePath("/", "layout");
    return status;
  });
}
export async function flagNoteAction(noteId: string, reason: string) {
  return attempt(async () => flagNote(await requireViewer(), String(noteId), String(reason)));
}
export async function reviewNoteAction(noteId: string, action: "remove" | "dismiss" | "restore") {
  return attempt(async () => {
    reviewNote(await requireViewer(), String(noteId), action === "remove" || action === "restore" ? action : "dismiss");
    revalidatePath("/admin/notes");
    revalidatePath("/", "layout");
  });
}
