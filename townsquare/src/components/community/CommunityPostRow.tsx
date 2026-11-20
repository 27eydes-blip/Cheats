"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CommunityPost } from "@/lib/communities";
import { editorRemoveAction } from "@/actions/communities";
import { Avatar } from "../ui/Avatar";
import { useConfirm } from "../ui/Confirm";
import { useToast } from "../providers";
import { AnswerIcon, TrashIcon } from "../icons";
import { Time } from "../Time";
import { Vote } from "./Vote";

/** A Desk discussion: vote column, headline-style title, comment count; editors get a remove tool. */
export function CommunityPostRow({ post, slug, editor }: { post: CommunityPost; slug: string; editor?: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  if (gone) return null;
  return (
    <article className="flex gap-4 border-b border-rule px-4 py-4 transition-colors hover:bg-paper-2/60 sm:px-6">
      <Vote postId={post.id} score={post.score} myVote={post.myVote} />
      <Link href={`/c/${slug}/p/${post.id}`} className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={20} />
          <span className="font-semibold text-ink-2">{post.author.displayName}</span>
          <span className="mono text-[11px]">· <Time ms={post.createdAt} /></span>
        </span>
        <h3 className="mt-1.5 font-display text-[21px] leading-snug font-semibold text-balance">{post.body}</h3>
        <span className="mono mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink-3"><AnswerIcon size={14} /> {post.counts.replies} COMMENTS</span>
      </Link>
      {editor && (
        <button
          type="button"
          onClick={async () => {
            if (!(await confirm({ title: "Remove this discussion from the Desk?", body: "It's hidden for everyone in this Desk. The author can still see it was removed.", confirm: "Remove", danger: true }))) return;
            start(async () => {
              const r = await editorRemoveAction(post.id);
              if (!r.ok) return toast(r.error, "error");
              setGone(true);
              toast("Removed by editor");
              router.refresh();
            });
          }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-[4px] text-ink-3 hover:bg-danger-soft hover:text-disagree"
          aria-label="Remove (editor)"
          title="Remove (editor)"
        >
          <TrashIcon size={17} />
        </button>
      )}
    </article>
  );
}
