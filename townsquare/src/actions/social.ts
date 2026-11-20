"use server";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";
import { setBlock, setBookmark, setFollow, setLike, setMute, setRepost } from "@/lib/social";
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
