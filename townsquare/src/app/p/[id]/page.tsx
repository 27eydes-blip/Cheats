import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getThread, getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { Composer } from "@/components/Composer";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getPostView(id, null);
  if (!p || p.gone) return { title: "Post" };
  return { title: `${p.author.displayName}: "${p.body.slice(0, 60)}${p.body.length > 60 ? "…" : ""}"`, openGraph: { description: p.body.slice(0, 200) } };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const thread = getThread(id, viewer?.id ?? null);
  if (!thread) notFound();
  const { post, ancestors, replies } = thread;
  return (
    <>
      <PageHeader title={post.replyTo ? "Thread" : "Post"} back compact />
      {ancestors.map((a) => <PostCard key={a.id} post={a} threadLine />)}
      <PostCard key={post.id} post={post} focus />
      {viewer && !post.gone && (
        <div className="border-b border-line">
          <Composer compact replyTo={post} />
        </div>
      )}
      {replies.length > 0 && <h2 className="kicker border-b border-line px-4 py-3 text-ink-3 sm:px-5">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</h2>}
      {replies.length === 0 ? (
        !post.gone && <EmptyState art="community" title="No replies yet" body="Be the first to reply." />
      ) : (
        replies.map((r, i) => <PostCard key={r.id} post={r} index={i} />)
      )}
    </>
  );
}
