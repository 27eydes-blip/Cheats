"use server";
import { revalidatePath } from "next/cache";
import { LIMITS } from "@/config";
import { AppError } from "@/lib/errors";
import { deleteFiles, saveImage } from "@/lib/media";
import { createPost, deletePost, editPost, getPostView, pinPost, votePoll } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { assertCanAct } from "@/lib/users";
import { attempt } from "./result";

/** Create a post from the composer form (text, up to 4 images with alt text, or a poll). */
export async function createPostAction(form: FormData) {
  return attempt(async () => {
    const user = await requireViewer();
    assertCanAct(user);
    const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > LIMITS.imagesPerPost) throw new AppError(`You can attach up to ${LIMITS.imagesPerPost} images.`);
    const alts = form.getAll("alts").map(String);
    const mediaIds: string[] = [];
    for (const [i, f] of files.entries()) mediaIds.push(await saveImage(user.id, f, "post", alts[i] ?? ""));
    const pollOptions = form.getAll("pollOption").map(String).filter((s) => s.trim());
    const id = createPost(user, {
      body: String(form.get("body") ?? ""),
      replyToId: (form.get("replyToId") as string) || null,
      quoteOfId: (form.get("quoteOfId") as string) || null,
      communityId: (form.get("communityId") as string) || null,
      storyKey: (form.get("storyKey") as string) || null,
      stance: ((form.get("stance") as string) || null) as never,
      mediaIds,
      alts,
      poll: form.get("hasPoll") === "1" ? { options: pollOptions, durationHours: Number(form.get("pollHours") ?? 24) } : null,
    });
    revalidatePath("/", "layout");
    return { id, post: getPostView(id, user.id)! };
  });
}

export async function editPostAction(postId: string, body: string) {
  return attempt(async () => {
    const user = await requireViewer();
    editPost(user, postId, body);
    revalidatePath("/", "layout");
    return getPostView(postId, user.id)!;
  });
}

export async function deletePostAction(postId: string) {
  return attempt(async () => {
    const user = await requireViewer();
    const files = deletePost(user, postId);
    if (files) deleteFiles(files);
    revalidatePath("/", "layout");
  });
}

export async function pinPostAction(postId: string | null) {
  return attempt(async () => {
    const user = await requireViewer();
    pinPost(user, postId);
    revalidatePath(`/u/${user.handle}`);
  });
}

export async function votePollAction(pollId: string, optionId: string, postId: string) {
  return attempt(async () => {
    const user = await requireViewer();
    votePoll(user, pollId, optionId);
    return getPostView(postId, user.id)!.poll!;
  });
}
