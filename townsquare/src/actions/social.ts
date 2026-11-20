"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { answerFollowRequest, setBlock, setBookmark, setFollow, setLike, setMute, setRepost, togglePin } from "@/lib/social";
import { markAllRead } from "@/lib/notifications";
import { attempt } from "./result";

export async function likeAction(postId: string, on: boolean) {
  return attempt(async () => setLike(await requireViewer(), postId, on));
}

export async function repostAction(postId: string, on: boolean) {
  return attempt(async () => setRepost(await requireViewer(), postId, on));
}

export async function bookmarkAction(postId: string, on: boolean) {
  return attempt(async () => setBookmark(await requireViewer(), postId, on));
}

export async function followAction(userId: string, on: boolean) {
  // No revalidate: the button updates optimistically, and pages refetch on navigation.
  return attempt(async () => setFollow(await requireViewer(), userId, on));
}

export async function blockAction(userId: string, on: boolean) {
  return attempt(async () => {
    const r = setBlock(await requireViewer(), userId, on);
    revalidatePath("/", "layout");
    return r;
  });
}

export async function muteAction(userId: string, on: boolean) {
  return attempt(async () => {
    const r = setMute(await requireViewer(), userId, on);
    revalidatePath("/", "layout");
    return r;
  });
}

export async function markNotificationsReadAction() {
  return attempt(async () => {
    markAllRead((await requireViewer()).id);
    revalidatePath("/", "layout");
  });
}

export async function answerFollowRequestAction(requesterId: string, approve: boolean) {
  return attempt(async () => {
    answerFollowRequest(await requireViewer(), requesterId, approve);
    revalidatePath("/notifications");
  });
}

export async function pinAction(postId: string) {
  return attempt(async () => {
    const on = togglePin(await requireViewer(), postId);
    revalidatePath("/u/[handle]", "page");
    return on;
  });
}
