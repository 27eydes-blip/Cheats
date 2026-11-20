"use server";
import { revalidatePath } from "next/cache";
import { setMembership, vote } from "@/lib/communities";
import { requireViewer } from "@/lib/session";
import { saveOnboarding } from "@/lib/users";
import { attempt } from "./result";

export async function joinCommunityAction(communityId: string, join: boolean) {
  return attempt(async () => {
    const r = setMembership(await requireViewer(), communityId, join);
    revalidatePath("/communities");
    return r;
  });
}

export async function voteAction(postId: string, value: -1 | 0 | 1) {
  return attempt(async () => vote(await requireViewer(), postId, value === 1 || value === -1 ? value : 0));
}

export async function finishOnboardingAction(input: { interests: string[]; town: string }) {
  return attempt(async () => {
    const u = await requireViewer();
    saveOnboarding(u.id, { interests: Array.isArray(input.interests) ? input.interests.map(String) : [], town: String(input.town ?? "") });
    revalidatePath("/", "layout");
  });
}
