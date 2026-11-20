import Link from "next/link";
import { forYouFeed, trending } from "@/lib/feed";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { whoToFollow } from "@/lib/social";
import { PageHeader } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { SearchBox } from "@/components/SearchBox";
import { UserList } from "@/components/UserList";
import { StoryCard } from "@/components/news/StoryCard";
import { TrendIcon } from "@/components/icons";
import { Sparkline } from "@/components/ui/Sparkline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

export default async function Explore() {
  const viewer = await getViewer();
  const top = forYouFeed(viewer?.id ?? null, null, 5).items;
  const trends = trending(8);
  const story = listStories(3).find((s) => s.status === "live");
  return (
    <>
      <PageHeader title="Explore" subtitle="What people are talking about right now">
        <div className="px-4 py-2.5 sm:px-6"><SearchBox /></div>
      </PageHeader>
      {story && <div className="px-4 pt-4 sm:px-6"><StoryCard story={story} /></div>}
      <section aria-labelledby="trends" className="pt-5">
        <h2 id="trends" className="px-4 pb-3 font-display text-h3 font-semibold sm:px-6">Trending topics</h2>
        <ol className="grid grid-cols-2 gap-2.5 px-4 sm:px-6">
          {trends.map((t, i) => {
            let h = 0;
            for (const c of t.tag) h = (h * 37 + c.charCodeAt(0)) % 360;
            return (
              <li key={t.tag}>
                <Link
                  href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`}
                  className="block h-full rounded-[var(--r-lg)] p-3.5 ring-1 ring-line transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-2"
                  style={{ background: `linear-gradient(135deg, hsl(${h} 85% 60% / 0.14), hsl(${(h + 60) % 360} 85% 60% / 0.04))` }}
                >
                  <span className="flex items-center justify-between">
                    <span className="num font-display text-[15px] font-semibold text-ink-3">#{i + 1}</span>
                    {t.rising && <span className="flex items-center gap-1 text-[11.5px] font-bold text-success"><TrendIcon size={13} /> Rising</span>}
                  </span>
                  <span className="mt-1 block truncate text-[16px] font-semibold">#{t.tag}</span>
                  <span className="mt-2 flex items-end justify-between gap-2">
                    <span className="num text-[12.5px] text-ink-3">{t.posts} posts</span>
                    <Sparkline values={t.series} width={64} height={22} color={t.rising ? "var(--success)" : "var(--accent)"} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
      <section aria-labelledby="wtf" className="mt-6 border-t border-line pt-5">
        <h2 id="wtf" className="px-4 pb-1 font-display text-h3 font-semibold sm:px-6">Who to follow</h2>
        <UserList users={whoToFollow(viewer?.id ?? null, 5)} />
      </section>
      <section aria-labelledby="popular" className="border-t border-line pt-5">
        <h2 id="popular" className="px-4 pb-1 font-display text-h3 font-semibold sm:px-6">Popular right now</h2>
        {top.map((i, n) => <PostCard key={i.key} post={i.post} index={n} />)}
        <div className="p-4 sm:px-6"><Link href="/?tab=foryou" className="btn-outline w-full">See more in For You</Link></div>
      </section>
    </>
  );
}
