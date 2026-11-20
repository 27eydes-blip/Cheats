import Link from "next/link";
import { all } from "@/lib/db";
import { latestNews, liveEvents, listStories } from "@/lib/news";
import { getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { followingFeed } from "@/lib/feed";
import { forYou } from "@/lib/foryou";
import { Feed } from "@/components/Feed";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { LiveWire } from "@/components/shell/LiveWire";
import { wireItems } from "@/lib/wire";
import { getFeedTabs } from "@/lib/feedtabs";
import { parseHomeTab, tabParam, TOPIC_LABEL } from "@/lib/feedtabs-meta";
import { getTeam } from "@/lib/sports/teams";
import { TeamLogo } from "@/components/sports/TeamLogo";
import { Suggestions } from "@/components/social/Suggestions";
import { suggestFriends } from "@/lib/social";
import { debates, latestTakes, voices } from "@/lib/takes";
import { CHANNELS } from "@/components/shell/channels";
import { BriefingPromo, DebateTile, HotStories, LeadTile, LiveNowTile, MoreStories, PollTile, QuickTakes, StoryTile, VoicesTile, WireTile } from "@/components/front/Tiles";
import { EmptyState } from "@/components/ui/States";
import { StoryRow, TrendingList } from "@/components/front/StoryCard";
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
    const tab = parseHomeTab(sp.tab);
    const tabs = getFeedTabs(vid);
    const team = tab.kind === "team" ? getTeam(tab.key) : null;
    const suggestions = vid ? suggestFriends(vid, 4) : [];
    const initial =
      tab.kind === "friends" ? (vid ? followingFeed(vid) : { items: [], nextCursor: null })
      : tab.kind === "topic" ? forYou(vid, null, undefined, { topic: tab.key })
      : tab.kind === "team" ? forYou(vid, null, undefined, { teamId: tab.key })
      : forYou(vid, null, undefined, { excludeStory: lead.key });
    const source =
      tab.kind === "friends" ? { tab: "following" }
      : tab.kind === "topic" ? { tab: "foryou", topic: tab.key }
      : tab.kind === "team" ? { tab: "foryou", team: tab.key }
      : { tab: "foryou", exclude: lead.key };
    const pinned = tab.kind === "topic" || tab.kind === "team" ? tabs.some((t) => t.kind === tab.kind && t.key === tab.key) : true;
    return (
      <div className="mx-auto max-w-[1080px] lg:px-6">
        <h1 className="sr-only">{APP_NAME} home</h1>
        <div className="grid lg:grid-cols-[minmax(0,640px)_minmax(0,330px)] lg:justify-center lg:gap-7">
          <div id="home-feed" className="min-w-0 lg:min-h-screen lg:border-x lg:border-[var(--hairline)]">
            <FeedTabs tabs={tabs} active={tab} />
            <LiveWire items={wireItems()} slot="home" />
            {(tab.kind === "foryou" || tab.kind === "friends") && <h2 className="sr-only">{tab.kind === "friends" ? "Friends" : "For You"} timeline</h2>}
            {tab.kind === "foryou" && <div role="article" aria-label={lead.title} className="tl-row"><StoryRow s={lead} lead /></div>}
            {tab.kind === "topic" && (
              <header className="tl-row flex items-center justify-between gap-3 px-4 py-2.5">
                <h2 className="text-[17px] font-bold">{TOPIC_LABEL[tab.key]}</h2>
                {!pinned && vid && <span className="text-[12.5px] text-ink-3">Tap + to pin this tab</span>}
              </header>
            )}
            {tab.kind === "team" && team && (
              <header className="tl-row flex items-center gap-3 px-4 py-2.5">
                <TeamLogo team={team} size="md" />
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-bold">{team.fullName}</h2>
                  <Link href={`/sports/${team.id}`} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-[var(--wn-blue-ink)] hover:text-[var(--wn-cyan-ink)]">Team page →</Link>
                </div>
              </header>
            )}
            <Feed
              key={tabParam(tab)}
              pad={false}
              initial={initial}
              source={source}
              live={tab.kind === "foryou" || tab.kind === "friends"}
              prependOwn={tab.kind === "foryou" || tab.kind === "friends"}
              interleave={suggestions.length && tab.kind === "foryou" ? { at: 5, node: <Suggestions people={suggestions.slice(0, 3)} compact /> } : undefined}
              empty={
                tab.kind === "friends" ? (
                  vid ? (
                    <div className="pb-4">
                      <EmptyState art="community" title="Your Friends feed is quiet" body="Follow a few people and their dispatches land here, newest first. Here are some to start with:" />
                      <div className="px-4"><Suggestions people={suggestions} compact /></div>
                      {!suggestions.length && <p className="px-4 text-center text-[14px] text-ink-3">Try <Link href="/explore" className="font-semibold text-[var(--wn-blue-ink)]">Discover</Link> to find voices.</p>}
                    </div>
                  ) : (
                    <EmptyState art="community" title="Log in to see your Friends feed" body="Friends shows dispatches from the people you follow, newest first." action={{ label: "Log in", href: "/login?next=/?tab=friends" }} />
                  )
                ) : tab.kind === "team" ? (
                  <EmptyState art="news" title={`No ${team?.name ?? "team"} stories yet`} body="When a story mentions this team, it shows up here automatically. Meanwhile, the Sports tab has the rest." action={{ label: "Sports", href: "/?tab=t-sports" }} />
                ) : tab.kind === "topic" ? (
                  <EmptyState art="news" title={`Quiet in ${TOPIC_LABEL[tab.key]}`} body="Nothing new on this topic yet. For You has the latest across everything." action={{ label: "For You", href: "/" }} />
                ) : (
                  <EmptyState art="news" title="Nothing new yet" body="Check back soon, or open a story and start the conversation." action={{ label: "Discover", href: "/explore" }} />
                )
              }
            />
          </div>
          <aside className="hidden min-w-0 lg:block">
            <div className="quiet sticky top-[calc(var(--sub-top)+16px)] space-y-4 pt-4">
              <TrendingList stories={hot} />
              {events.some((e) => e.isLive) && <LiveNowTile events={events} />}
              <BriefingPromo minutes={Math.max(4, Math.round((stories.slice(0, 10).reduce((n, s) => n + s.title.split(" ").length + s.summary.split(" ").length, 0) + 600) / 230))} count={Math.min(10, stories.length)} />
              {suggestions.length ? <Suggestions people={suggestions} /> : <VoicesTile voices={people} />}
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
          <div className="sticky top-[calc(var(--sub-top)+16px)] space-y-5">
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
