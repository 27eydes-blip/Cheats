import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getThread, getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { Composer } from "@/components/Composer";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";

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
      <PageHeader title={post.replyTo ? "Thread" : "Post"} back />
      {ancestors.map((a) => (
        <PostCard key={a.id} post={a} threadLine />
      ))}
      <PostCard key={post.id} post={post} focus />
      {viewer && !post.gone && (
        <div className="border-b border-line">
          <Composer compact replyTo={post} />
        </div>
      )}
      {replies.length === 0 ? (
        !post.gone && <p className="px-6 py-10 text-center text-muted">No replies yet.</p>
      ) : (
        replies.map((r) => <PostCard key={r.id} post={r} />)
      )}
    </>
  );
}
