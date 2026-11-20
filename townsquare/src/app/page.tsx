import Link from "next/link";
import { APP_NAME } from "@/config";
import { followingFeed, forYouFeed, trending } from "@/lib/feed";
import { latestNews, listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { Composer } from "@/components/Composer";
import { Feed } from "@/components/Feed";
import { PageHeader, Tabs } from "@/components/PageHeader";
import { SwipeTabs } from "@/components/SwipeTabs";
import { HeadlineRow, StoryCard } from "@/components/news/StoryCard";
import { Kicker } from "@/components/ui/Badge";
import { TopicChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/States";
import { LogoMark } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";

const TABS = ["following", "foryou", "breaking"] as const;

function Landing() {
  const trends = trending(6);
  return (
    <section className="relative overflow-hidden border-b border-line px-5 pt-10 pb-8 sm:px-8 sm:pt-14">
      {/* Gradient mesh: logged-out landing only */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0 opacity-90">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-[#3b82f6] opacity-25 blur-3xl dark:opacity-30" />
        <div className="absolute -top-10 right-[-60px] h-80 w-80 rounded-full bg-[#7c3aed] opacity-20 blur-3xl dark:opacity-30" />
        <div className="absolute bottom-[-80px] left-1/3 h-64 w-64 rounded-full bg-[#ef4444] opacity-[0.12] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:18px_18px] opacity-50 [mask-image:linear-gradient(180deg,#000,transparent_85%)]" />
      </div>
      <div className="relative">
        <LogoMark size={52} />
        <h2 className="mt-5 max-w-lg font-display text-display font-semibold text-balance">
          News, and the people <span className="text-accent-grad italic">talking about it.</span>
        </h2>
        <p className="mt-3 max-w-md text-[16.5px] text-ink-2">Follow people, join communities, and follow live stories as they break, all in one feed you control.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/signup" className="btn-primary !min-h-12 !px-6 !text-base">Join {APP_NAME}</Link>
          <Link href="/login" className="btn-outline !min-h-12 !px-6 !text-base">Log in</Link>
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          {trends.map((t) => <TopicChip key={t.tag} tag={t.tag} href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`} />)}
        </div>
      </div>
    </section>
  );
}

function Breaking() {
  const stories = listStories(6).filter((s) => s.status !== "ended");
  const news = latestNews(undefined, 12);
  return (
    <div className="pb-4">
      {stories[0] && <div className="px-4 pt-4 sm:px-6"><StoryCard story={stories[0]} size="lg" /></div>}
      {stories.length > 1 && (
        <div className="grid gap-3 px-4 pt-3 sm:grid-cols-2 sm:px-6">
          {stories.slice(1, 3).map((s) => <StoryCard key={s.key} story={s} />)}
        </div>
      )}
      <h2 className="kicker px-4 pt-6 pb-1 text-ink-3 sm:px-6">Latest headlines</h2>
      <div className="divide-y divide-line">{news.map((n) => <HeadlineRow key={n.id} n={n} />)}</div>
      <div className="px-4 pt-4 sm:px-6"><Link href="/news" className="btn-outline w-full">Open the News hub</Link></div>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const requested = TABS.find((t) => t === sp.tab);
  const tab = requested === "breaking" ? "breaking" : viewer && requested !== "foryou" ? "following" : "foryou";
  const page = tab === "following" ? followingFeed(viewer!.id) : tab === "foryou" ? forYouFeed(viewer?.id ?? null) : null;
  const tabs = [
    ...(viewer ? [{ key: "following", label: "Following", href: "/?tab=following" }] : []),
    { key: "foryou", label: "For You", href: "/?tab=foryou" },
    { key: "breaking", label: <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-live rounded-full bg-live" />Breaking</span>, href: "/?tab=breaking" },
  ];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      {!viewer && <Landing />}
      <PageHeader title={viewer ? "Home" : "Top of the feed"} kicker={<Kicker tone="muted">{today}</Kicker>}>
        <Tabs active={tab} tabs={tabs} />
      </PageHeader>
      <SwipeTabs hrefs={tabs.map((t) => t.href)} index={tabs.findIndex((t) => t.key === tab)}>
        {viewer && tab !== "breaking" && (
          <div className="hidden border-b border-line sm:block">
            <Composer compact />
          </div>
        )}
        {page ? (
          <Feed
            key={tab}
            initial={page}
            source={{ tab }}
            live
            prependOwn={tab === "following"}
            empty={
              tab === "following" ? (
                <EmptyState art="feed" title="Your Following feed is empty" body="Follow people and their posts show up here, newest first. No algorithm." action={{ label: "Find people to follow", href: "/explore" }} />
              ) : (
                <EmptyState art="feed" title="Nothing here yet" />
              )
            }
          />
        ) : (
          <Breaking />
        )}
      </SwipeTabs>
    </>
  );
}
