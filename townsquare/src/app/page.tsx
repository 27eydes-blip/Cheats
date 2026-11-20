import Link from "next/link";
import { all } from "@/lib/db";
import { latestNews, liveEvents, listStories } from "@/lib/news";
import { getPostView, hydrate } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { debates, latestTakes, voices } from "@/lib/takes";
import { CHANNELS } from "@/components/shell/channels";
import { Deck, type DeckCardData } from "@/components/front/Deck";
import { BriefingPromo, DebateTile, HotStories, LeadTile, LiveNowTile, MoreStories, PollTile, QuickTakes, StoryTile, VoicesTile, WireTile } from "@/components/front/Tiles";
import { EmptyState } from "@/components/ui/States";
import { Wordmark } from "@/components/ui/Logo";
import { MarketStrip } from "@/components/markets/LiveQuotes";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { marketStatus } from "@/lib/markets/clock";
import { INDEX_ETFS } from "@/lib/markets/universe";

export const dynamic = "force-dynamic";

const FRONT_CHANNELS = CHANNELS.filter((c) => c.href.startsWith("/?") || c.href === "/");

export default async function FrontPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const c = (await searchParams).c;
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
  // Tile sizes follow importance: live stories in the second row get the wide tiles.
  const second = rest.slice(0, 3);
  const wide = second.slice(0, 2).some((s) => s.status === "live");
  const row2 = wide ? second.slice(0, 2) : second;
  const more = rest.slice(row2.length);
  const words = stories.slice(0, 10).reduce((n, s) => n + s.title.split(" ").length + s.summary.split(" ").length, 0) + 600;

  // Phone deck: stories with their most-agreed take, a debate after the second story.
  const topTakes = new Map(
    all<{ story_key: string; id: string }>(
      `SELECT story_key, id FROM posts p WHERE story_key IN (${stories.map(() => "?").join(",")}) AND reply_to_id IS NULL AND deleted_at IS NULL AND removed_at IS NULL
       ORDER BY (SELECT count(*) FROM stances s WHERE s.target_type = 'post' AND s.target_id = p.id AND s.value = 'agree') DESC`,
      stories.map((s) => s.key),
    ).reverse().map((r) => [r.story_key, r.id]),
  );
  const tops = new Map(hydrate([...topTakes.values()], vid).map((p) => [p.id, p]));
  const cards: DeckCardData[] = [];
  stories.slice(0, 8).forEach((s, i) => {
    cards.push({ kind: "story", s, top: tops.get(topTakes.get(s.key) ?? "") });
    if (i === 1 && fights[0]) cards.push({ kind: "debate", d: fights[0] });
  });
  cards.push({ kind: "end" });

  return (
    <>
      <h1 className="sr-only">{channel ? `${channel.label} — ` : ""}Townsquare Front Page</h1>
      {/* Phone: story deck */}
      <div className="md:hidden">
        <Deck cards={cards} channels={FRONT_CHANNELS.map((x) => ({ href: x.href, label: x.label }))} channelIndex={Math.max(0, FRONT_CHANNELS.findIndex((x) => x.key === (channel?.key ?? "front")))} />
      </div>

      {/* Tablet & desktop: bento front page */}
      <div className="mx-auto hidden max-w-[1320px] px-6 pt-8 md:block lg:px-8">
        {channel && (
          <div className="mb-6 flex items-end justify-between border-b border-rule pb-3">
            <h2 className="font-display text-display font-semibold">{channel.label}</h2>
            <Link href="/" className="folio !text-[10.5px] text-ink-3 hover:text-navy-ink">← Front Page</Link>
          </div>
        )}
        {(!channel || channel.key === "Business") && <MarketStrip initial={indexQuotes} mode={marketMode()} label={marketStatus().label} />}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-12 lg:gap-x-10">
          <div className="col-span-2 lg:col-span-8"><LeadTile s={lead} latest={latest} /></div>
          <div className="col-span-2 grid gap-8 md:grid-cols-2 lg:col-span-4 lg:block lg:space-y-8">
            {events.some((e) => e.isLive) && <LiveNowTile events={events} />}
            <HotStories stories={hot} />
          </div>

          {row2.map((s) => <div key={s.key} className={`${wide ? "lg:col-span-6" : "lg:col-span-4"} ${!wide && row2.indexOf(s) === 2 ? "max-lg:hidden" : ""}`}><StoryTile s={s} big={wide} /></div>)}

          {fights[0] && <div className="col-span-2 lg:col-span-8"><DebateTile debate={fights[0]} /></div>}
          <div className="col-span-2 grid gap-8 md:grid-cols-2 lg:col-span-4 lg:block lg:space-y-8">
            {poll?.poll && <PollTile post={poll} />}
            <BriefingPromo minutes={Math.max(4, Math.round(words / 230))} count={Math.min(10, stories.length)} />
          </div>

          <div className="lg:col-span-4"><QuickTakes takes={takes} /></div>
          <div className="lg:col-span-4"><VoicesTile voices={people} /></div>
          <div className="col-span-2 lg:col-span-4"><WireTile items={wire} /></div>

          {more.length > 0 && (
            <div className="col-span-2 lg:col-span-12">
              <div className="mb-2 flex items-baseline justify-between border-t-2 border-navy-ink pt-3">
                <h2 className="folio text-navy-ink">More stories</h2>
              </div>
              <MoreStories stories={more} />
            </div>
          )}
        </div>
        <footer className="mt-16 flex flex-wrap items-end justify-between gap-6 border-t-[3px] border-navy-ink pt-5 pb-4 text-[12.5px] text-ink-3">
          <div><Wordmark size="sm" /><p className="mt-1">Built by Gleyde Technologies, LLC. Townsquare is a working name. Sample stories and outlets are fictional.</p></div>
          <nav className="flex gap-5">
            <Link href="/legal/terms" className="hover:text-ink-1">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-ink-1">Privacy</Link>
            <Link href="/legal/guidelines" className="hover:text-ink-1">Community Guidelines</Link>
            <Link href="/design" className="hover:text-ink-1">Design system</Link>
          </nav>
        </footer>
      </div>
    </>
  );
}
