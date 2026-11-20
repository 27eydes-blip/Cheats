import Link from "next/link";
import { all } from "@/lib/db";
import { latestNews, liveEvents, listStories } from "@/lib/news";
import { getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { followingFeed } from "@/lib/feed";
import { forYou } from "@/lib/foryou";
import { Feed } from "@/components/Feed";
import { HomeTabs } from "@/components/feed/HomeTabs";
import { debates, latestTakes, voices } from "@/lib/takes";
import { CHANNELS } from "@/components/shell/channels";
import { BriefingPromo, DebateTile, HotStories, LeadTile, LiveNowTile, MoreStories, PollTile, QuickTakes, StoryTile, VoicesTile, WireTile } from "@/components/front/Tiles";
import { EmptyState } from "@/components/ui/States";
import { APP_NAME } from "@/config";
import { MarketStrip } from "@/components/markets/LiveQuotes";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { marketStatus } from "@/lib/markets/clock";
import { INDEX_ETFS } from "@/lib/markets/universe";

export const dynamic = "force-dynamic";

const FRONT_CHANNELS = CHANNELS.filter((c) => c.href.startsWith("/?") || c.href === "/");

export default async function FrontPage({ searchParams }: { searchParams: Promise<{ c?: string; tab?: string }> }) {
  const sp = await searchParams;
  const c = sp.c;
  const channel = FRONT_CHANNELS.find((x) => x.key === c && x.key !== "front");
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const section = channel?.key;

  const stories = listStories(14, { section, viewerId: vid });
  const hot = listStories(5, { order: "hot", viewerId: vid });
  const events = liveEvents();
  const takes = latestTakes(vid, 4);
  const fights = debates(vid, 3);
  const pollId = all<{ post_id: string }>("SELECT p.post_id FROM polls p JOIN posts x ON x.id = p.post_id WHERE x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1")[0]?.post_id;
  const poll = pollId ? getPostView(pollId, vid) : null;
  const people = voices(vid, 3, section);
  const wire = latestNews(section, 5);
  const indexQuotes = await getQuotes(INDEX_ETFS.map((t) => t.symbol));

  if (!stories.length) {
    return <EmptyState art="news" title={`Quiet on the ${channel?.label ?? "national"} desk`} body="No stories in this channel yet. Check the Front Page." action={{ label: "Front Page", href: "/" }} />;
  }

  const [lead, ...rest] = stories;
  const latest = all<{ body: string }>("SELECT body FROM story_updates WHERE story_key = ? ORDER BY created_at DESC LIMIT 2", [lead.key]).map((r) => r.body);
  if (!channel) {
    const tab = sp.tab === "following" ? "following" : "foryou";
    const initial = tab === "following" ? (vid ? followingFeed(vid) : { items: [], nextCursor: null }) : forYou(vid, null, undefined, { excludeStory: lead.key });
    return (
      <div className="mx-auto max-w-[1320px] px-4 pt-5 lg:px-8 lg:pt-8">
        <h1 className="sr-only">{APP_NAME} Front Page</h1>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="min-w-0 space-y-5">
            <LeadTile s={lead} latest={latest} />
            <div className="lg:hidden"><HotStories stories={hot} row /></div>
            <MarketStrip initial={indexQuotes} mode={marketMode()} label={marketStatus().label} />
            <HomeTabs tab={tab} />
            <div className="card overflow-hidden">
              <Feed
                key={tab}
                initial={initial}
                source={{ tab, ...(tab === "foryou" ? { exclude: lead.key } : {}) }}
                live={tab === "following"}
                prependOwn
                empty={
                  tab === "following" ? (
                    vid ? (
                      <EmptyState art="community" title="Your Following feed is quiet" body="Follow a few Voices and their dispatches land here, newest first. Try one of these:" action={{ label: "Find people", href: "/explore" }} />
                    ) : (
                      <EmptyState art="community" title="Log in to see who you follow" body="Following shows dispatches from people you follow, newest first." action={{ label: "Log in", href: "/login?next=/?tab=following" }} />
                    )
                  ) : (
                    <EmptyState art="news" title="Nothing new yet" body="Check back soon, or open a story and start the conversation." action={{ label: "Trending", href: "/explore" }} />
                  )
                }
              />
            </div>
          </div>
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-[calc(var(--dial-h)+var(--wire-h)+16px)] space-y-5">
              <HotStories stories={hot} />
              {events.some((e) => e.isLive) && <LiveNowTile events={events} />}
              <BriefingPromo minutes={Math.max(4, Math.round((stories.slice(0, 10).reduce((n, s) => n + s.title.split(" ").length + s.summary.split(" ").length, 0) + 600) / 230))} count={Math.min(10, stories.length)} />
              <VoicesTile voices={people} />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const grid = rest.slice(0, 6);
  const more = rest.slice(6);
  const words = stories.slice(0, 10).reduce((n, s) => n + s.title.split(" ").length + s.summary.split(" ").length, 0) + 600;

  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-5 lg:px-8 lg:pt-8">
      <h1 className="sr-only">{channel ? `${channel.label} — ` : ""}{APP_NAME} Front Page</h1>
      {channel && (
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 className="font-display text-display font-extrabold uppercase">{channel.label}</h2>
          <span className="flex items-center gap-2">
            {channel.key === "Sports" && <Link href="/sports" className="btn-outline !min-h-10 !text-[13px]">All teams →</Link>}
            <Link href="/" className="inline-flex min-h-10 items-center text-[12px] font-bold tracking-[0.06em] text-navy-ink uppercase hover:text-[var(--wn-cyan-ink)]">← Front Page</Link>
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <LeadTile s={lead} latest={latest} />
          {/* Phone: Trending as a swipe row right under the hero */}
          <div className="lg:hidden"><HotStories stories={hot} row /></div>
          {grid.length > 0 && (
            <section aria-labelledby="top-stories">
              <h2 id="top-stories" className="mb-3 flex items-center gap-2 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">
                <span aria-hidden="true" className="h-5 w-1 rounded-full bg-[var(--wn-blue-fill)] shadow-[0_0_10px_var(--wn-blue)]" /> Top stories
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {grid.map((s, i) => <div key={s.key} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}><StoryTile s={s} /></div>)}
              </div>
            </section>
          )}
        </div>
        {/* Desktop: Trending + Live in a sticky sidebar */}
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-[calc(var(--dial-h)+var(--wire-h)+16px)] space-y-5">
            <HotStories stories={hot} />
            {events.some((e) => e.isLive) && <LiveNowTile events={events} />}
          </div>
        </aside>
      </div>

      {(!channel || channel.key === "Business") && <div className="mt-8"><MarketStrip initial={indexQuotes} mode={marketMode()} label={marketStatus().label} /></div>}

      <div className="mt-2 grid gap-5 lg:grid-cols-12">
        {fights[0] && <div className="lg:col-span-8"><DebateTile debate={fights[0]} /></div>}
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
          <BriefingPromo minutes={Math.max(4, Math.round(words / 230))} count={Math.min(10, stories.length)} />
          {poll?.poll && <PollTile post={poll} />}
        </div>
        {events.some((e) => e.isLive) && <div className="lg:hidden"><LiveNowTile events={events} /></div>}
        <div className="lg:col-span-4"><QuickTakes takes={takes} /></div>
        <div className="lg:col-span-4"><VoicesTile voices={people} /></div>
        <div className="lg:col-span-4"><WireTile items={wire} /></div>
      </div>

      {more.length > 0 && (
        <section aria-labelledby="more" className="mt-8">
          <h2 id="more" className="mb-3 flex items-center gap-2 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-[var(--wn-blue-fill)] shadow-[0_0_10px_var(--wn-blue)]" /> More stories
          </h2>
          <MoreStories stories={more} />
        </section>
      )}
    </div>
  );
}
