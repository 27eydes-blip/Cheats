import Link from "next/link";
import type { CommunityPost } from "@/lib/communities";
import { Avatar } from "../ui/Avatar";
import { ReplyIcon } from "../icons";
import { Time } from "../Time";
import { Vote } from "./Vote";

/** A discussion in a community list: vote column, title-style body, comment count. */
export function CommunityPostRow({ post, slug }: { post: CommunityPost; slug: string }) {
  return (
    <article className="flex gap-3 border-b border-line px-4 py-4 transition-colors hover:bg-surface-2/40 sm:px-6">
      <Vote postId={post.id} score={post.score} myVote={post.myVote} />
      <Link href={`/c/${slug}/p/${post.id}`} className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
          <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={20} ring={false} />
          <span className="font-semibold text-ink-2">{post.author.displayName}</span> · <Time ms={post.createdAt} />
        </span>
        <h3 className="mt-1.5 font-display text-[19px] leading-snug font-semibold text-balance">{post.body}</h3>
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink-2">
          <ReplyIcon size={15} /> <span className="num">{post.counts.replies}</span> comment{post.counts.replies === 1 ? "" : "s"}
        </span>
      </Link>
    </article>
  );
}
