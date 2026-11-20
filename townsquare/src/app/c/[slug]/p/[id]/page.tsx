import Link from "next/link";
import { notFound } from "next/navigation";
import { commentTree, getCommunity, getCommunityPost } from "@/lib/communities";
import { getViewer } from "@/lib/session";
import { CommunityIconTile } from "@/components/community/CommunityArt";
import { CommentTree } from "@/components/community/Comments";
import { Vote } from "@/components/community/Vote";
import { Composer } from "@/components/Composer";
import { BackIcon } from "@/components/icons";
import { RichText } from "@/components/RichText";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedSeal } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { Time } from "@/components/Time";

export const dynamic = "force-dynamic";

export default async function CommunityThread({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const viewer = await getViewer();
  const c = getCommunity(slug, viewer?.id ?? null);
  const post = getCommunityPost(id, viewer?.id ?? null);
  if (!c || !post || (c.visibility !== "public" && !c.joined)) notFound();
  const tree = commentTree(id, viewer?.id ?? null);
  return (
    <div className="mx-auto max-w-[860px]">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 sm:px-6">
        <Link href={`/c/${c.slug}`} className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2" aria-label={`Back to ${c.name}`}><BackIcon size={20} /></Link>
        <CommunityIconTile slug={c.slug} name={c.name} size={30} />
        <Link href={`/c/${c.slug}`} className="text-[14.5px] font-semibold hover:underline">{c.name}</Link>
      </div>
      <article className="flex gap-3 px-4 pt-5 pb-4 sm:px-6">
        <Vote postId={post.id} score={post.score} myVote={post.myVote} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13.5px] text-ink-3">
            <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={22} ring={false} />
            <Link href={`/u/${post.author.handle}`} className="font-semibold text-ink-2 hover:underline">{post.author.displayName}</Link>
            {post.author.verified && <VerifiedSeal size={13} />}· <Time ms={post.createdAt} />
          </div>
          <h1 className="mt-2 font-display text-h1 leading-tight font-semibold text-balance"><RichText text={post.body} /></h1>
          <p className="num mt-3 text-[13.5px] text-ink-3">{post.counts.replies} comments</p>
        </div>
      </article>
      {viewer && c.joined && (
        <div className="border-y border-line"><Composer compact replyTo={post} /></div>
      )}
      {viewer && !c.joined && <p className="border-y border-line bg-surface-2/60 px-6 py-3 text-[14px] text-ink-3">Join {c.name} to comment.</p>}
      {tree.length === 0 ? <EmptyState art="community" title="No comments yet" body="Start the discussion." /> : <CommentTree nodes={tree} />}
    </div>
  );
}
