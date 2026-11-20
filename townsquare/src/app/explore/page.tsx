import Link from "next/link";
import { forYouFeed, trending } from "@/lib/feed";
import { getViewer } from "@/lib/session";
import { whoToFollow } from "@/lib/social";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { SearchBox } from "@/components/SearchBox";
import { UserList } from "@/components/UserList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

export default async function Explore() {
  const viewer = await getViewer();
  const top = forYouFeed(viewer?.id ?? null, null, 5).items;
  return (
    <>
      <PageHeader title="Explore">
        <div className="px-4 pb-3"><SearchBox /></div>
      </PageHeader>
      <section aria-labelledby="trends">
        <h2 id="trends" className="px-4 pt-4 pb-2 text-lg font-extrabold">Trending topics</h2>
        <ol className="grid grid-cols-2 gap-2 px-4 pb-4">
          {trending(10).map((t, i) => (
            <li key={t.tag}>
              <Link href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`} className="card block p-3 hover:bg-surface">
                <span className="text-xs text-muted">#{i + 1}</span>
                <span className="block truncate font-bold">#{t.tag}</span>
                <span className="text-xs text-muted">{t.posts} posts</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="wtf" className="border-t border-line">
        <h2 id="wtf" className="px-4 pt-4 pb-1 text-lg font-extrabold">Who to follow</h2>
        <UserList users={whoToFollow(viewer?.id ?? null, 6)} />
      </section>
      <section aria-labelledby="popular">
        <h2 id="popular" className="px-4 pt-4 pb-1 text-lg font-extrabold">Popular right now</h2>
        {top.map((i) => <PostCard key={i.key} post={i.post} />)}
      </section>
    </>
  );
}
