"use server";
import { castStance, type StanceTarget, type StanceValue } from "@/lib/stance";
import { requireViewer } from "@/lib/session";
import { attempt } from "./result";

/** Cast, change, or clear your stance on a Story or a Take. Returns the new split. */
export async function stanceAction(type: StanceTarget, id: string, value: StanceValue | null) {
  return attempt(async () => castStance(await requireViewer(), type === "story" ? "story" : "post", String(id), value));
}
