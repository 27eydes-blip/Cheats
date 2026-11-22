import { redirect } from "next/navigation";
import { listStories } from "@/lib/news";
import { TimelineAside } from "@/components/front/TimelineAside";
import { getViewer } from "@/lib/session";
import { followingFeed } from "@/lib/feed";
import { forYou } from "@/lib/foryou";
import { Feed } from "@/components/Feed";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { parseHomeTab, tabHref, topicHref } from "@/lib/feedtabs-meta";
import { Suggestions } from "@/components/social/Suggestions";
import { suggestFriends } from "@/lib/social";
import { EmptyState } from "@/components/ui/States";
import { StoryRow } from "@/components/front/StoryCard";
import { APP_NAME } from "@/config";

export const dynamic = "force-dynamic";

/** Old ?c=Politics channel links now go to the topic pages. */
const LEGACY_CHANNEL: Record<string, string> = { Politics: "politics", World: "world", Business: "markets", Tech: "tech", Sports: "sports", Culture: "culture" };

/**
 * Home: one feed tab row (For You, Friends) directly above the timeline.
 * Topics live in the top nav and have their own pages.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string; tab?: string }> }) {
  const sp = await searchParams;
  if (sp.c && LEGACY_CHANNEL[sp.c]) redirect(topicHref(LEGACY_CHANNEL[sp.c]));
  const parsed = parseHomeTab(sp.tab);
  if (parsed.kind === "topic" || parsed.kind === "team") redirect(tabHref(parsed));
  const tab = parsed;
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const [lead] = listStories(1, { viewerId: vid });
  const suggestions = vid && tab.kind === "foryou" ? suggestFriends(vid, 3) : [];
  const initial = tab.kind === "friends" ? (vid ? followingFeed(vid) : { items: [], nextCursor: null }) : forYou(vid, null, undefined, { excludeStory: lead?.key });
  const source = tab.kind === "friends" ? { tab: "following" } : { tab: "foryou", ...(lead ? { exclude: lead.key } : {}) };
  return (
    <div className="mx-auto max-w-[1080px] lg:px-6">
      <h1 className="sr-only">{APP_NAME} home</h1>
      <div className="grid lg:grid-cols-[minmax(0,640px)_minmax(0,330px)] lg:justify-center lg:gap-7">
        <div id="home-feed" className="min-w-0 lg:min-h-screen lg:border-x lg:border-[var(--hairline)]">
          <FeedTabs active={tab} />
          <h2 className="sr-only">{tab.kind === "friends" ? "Friends" : "For You"} timeline</h2>
          {tab.kind === "foryou" && lead && <div role="article" aria-label={lead.title} className="tl-row"><StoryRow s={lead} lead /></div>}
          <Feed
            key={tab.kind}
            pad={false}
            initial={initial}
            source={source}
            live
            prependOwn
            interleave={suggestions.length ? { at: 5, node: <Suggestions people={suggestions} compact /> } : undefined}
            empty={
              tab.kind === "friends" ? (
                vid ? (
                  <EmptyState art="community" title="Your Friends feed is quiet" body="Follow a few people and their dispatches land here, newest first." action={{ label: "Discover", href: "/explore" }} />
                ) : (
                  <EmptyState art="community" title="Log in to see your Friends feed" body="Friends shows dispatches from the people you follow, newest first." action={{ label: "Log in", href: "/login?next=/?tab=friends" }} />
                )
              ) : (
                <EmptyState art="news" title="Nothing new yet" body="Check back soon, or open a story and start the conversation." action={{ label: "Discover", href: "/explore" }} />
              )
            }
          />
        </div>
        <TimelineAside viewerId={vid} />
      </div>
    </div>
  );
}
