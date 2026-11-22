import Link from "next/link";
import { getViewer } from "@/lib/session";
import { forYou } from "@/lib/foryou";
import { hydrate } from "@/lib/posts";
import { aiDeskPostIds, blindspots, coverageToday, opinionAcrossSpectrum, sectionStories, SECTIONS, trending, type SectionKey } from "@/lib/sections";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { Feed } from "@/components/Feed";
import { PostCard } from "@/components/PostCard";
import { EmptyState } from "@/components/ui/States";
import { BalanceCard, Blindspots, MarketsCard, OpinionColumns, ReadersSplit, SectionCard, SectionHead, SectionHero, SectionRow, TrendingCard, type Labels } from "./SectionParts";

/**
 * One section page (Politics, World, Business, Tech, Culture): masthead and
 * sub-section chips, lead story, top stories, the spectrum views where they
 * make sense, opinion, AI desk, readers' conversation, and a sidebar with the
 * day's balance, trending, readers' split and the sub-sections.
 */
export async function SectionPage({ section, beat: rawBeat }: { section: SectionKey; beat?: string | null }) {
  const cfg = SECTIONS[section];
  const beat = rawBeat && rawBeat in cfg.beats ? rawBeat : null;
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const labels: Labels = { section: cfg.label, beats: Object.fromEntries(Object.entries(cfg.beats).map(([k, b]) => [k, b.label])) };
  const all = sectionStories(section, { limit: 40, viewerId: vid });
  const stories = beat ? sectionStories(section, { limit: 30, beat, viewerId: vid }) : all.slice(0, 30);
  const [lead, ...rest] = stories;
  const pair = rest.slice(0, 2);
  const list = rest.slice(2, 9);
  const spots = cfg.spectrum ? blindspots(stories) : { left: [], right: [] };
  const opinion = cfg.spectrum ? opinionAcrossSpectrum(section, 3) : null;
  const today = coverageToday(section);
  const hot = trending(all, 5);
  const ai = hydrate(aiDeskPostIds(section, 2), vid);
  const quotes = section === "business" ? (await getQuotes(["SPY", "QQQ", "DIA", "IWM"])).map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, changePct: q.changePct })) : [];
  const feed = forYou(vid, null, undefined, { topic: cfg.feedTopic, postsOnly: true });
  const href = (b: string | null) => (b ? `${cfg.path}?${section === "world" ? "region" : "beat"}=${b}` : cfg.path);

  const side = (idp: string) => (
    <>
      {quotes.length > 0 && <MarketsCard quotes={quotes} demo={marketMode() === "demo"} idp={idp} />}
      {cfg.spectrum && <BalanceCard stats={today} section={cfg.label} idp={idp} />}
      <TrendingCard stories={hot} label={cfg.label} idp={idp} />
      <ReadersSplit stories={stories} idp={idp} />
      <section aria-labelledby={`${idp}beats`} className="rounded-[16px] bg-white/[0.03] p-4 ring-1 ring-[var(--hairline)]">
        <h2 id={`${idp}beats`} className="text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">{cfg.beatsLabel}</h2>
        <ul className="mt-1.5">
          {Object.entries(cfg.beats).map(([k, b]) => (
            <li key={k}>
              <Link href={href(k)} aria-current={beat === k ? "page" : undefined} className="flex min-h-10 items-center justify-between text-[14.5px] font-semibold hover:underline">
                {b.label}
                <span aria-hidden="true" className="text-ink-3">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );

  return (
    <div className="mx-auto max-w-[1080px] lg:px-6" data-section={section}>
      <div className="grid lg:grid-cols-[minmax(0,680px)_minmax(0,320px)] lg:justify-center lg:gap-7">
        <div className="min-w-0 pb-6 lg:min-h-screen lg:border-x lg:border-[var(--hairline)]">
          <header className="relative overflow-hidden border-b border-[var(--hairline)] px-4 pt-6 pb-4">
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-[-60px] h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: `radial-gradient(circle, ${cfg.glow[0]} 0%, transparent 60%)` }} />
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-[90px] h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ background: `radial-gradient(circle, ${cfg.glow[1]} 0%, transparent 60%)` }} />
            <p className="relative text-[12px] font-extrabold tracking-[0.16em] text-[var(--wn-blue-ink)] uppercase">{cfg.kicker}</p>
            <h1 className="relative mt-1 font-display text-[clamp(2.6rem,2rem+3vw,3.8rem)] leading-[0.95] font-extrabold uppercase">{cfg.label}</h1>
            <p className="relative mt-2 max-w-[520px] text-[15px] leading-snug text-ink-2">{cfg.dek}</p>
            <nav aria-label={cfg.beatsLabel} data-no-swipe className="scrollbar-none relative -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4">
              {[null, ...Object.keys(cfg.beats)].map((b) => (
                <Link key={b ?? "all"} href={href(b)} aria-current={beat === b ? "page" : undefined} className={`tap inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${beat === b ? "bg-[var(--wn-blue-fill)] text-white" : "text-ink-2 ring-1 ring-[var(--hairline)] hover:text-ink-1"}`}>
                  {b ? cfg.beats[b].label : "All"}
                </Link>
              ))}
            </nav>
          </header>

          {lead ? (
            <>
              <SectionHero s={lead} labels={labels} spectrum={cfg.spectrum} />

              {pair.length > 0 && (
                <section aria-labelledby="top">
                  <SectionHead id="top" title={beat ? cfg.beats[beat].label : "Top stories"} />
                  <div className="grid gap-5 px-4 sm:grid-cols-2">{pair.map((s) => <SectionCard key={s.key} s={s} labels={labels} />)}</div>
                  {list.length > 0 && <ol className="mt-4 border-t border-[var(--hairline)]">{list.map((s, i) => <SectionRow key={s.key} s={s} n={i + 1 + pair.length + 1} labels={labels} />)}</ol>}
                </section>
              )}

              <div className="space-y-3 px-4 pt-6 lg:hidden">{side("m-")}</div>

              {(spots.left.length > 0 || spots.right.length > 0) && (
                <section aria-labelledby="blind">
                  <SectionHead id="blind" title="Blindspots" dek="Stories covered mostly by one side, so readers of the other side may have missed them." />
                  <Blindspots left={spots.left} right={spots.right} />
                </section>
              )}
            </>
          ) : (
            <>
              <div className="px-4 pt-6">
                <EmptyState
                  art="news"
                  title={beat ? `No ${cfg.beats[beat].label} stories right now` : `${cfg.label} news is on its way`}
                  body="Stories appear here as outlets publish them. The feeds are read every 10 minutes."
                  action={beat ? { label: `All ${cfg.label.toLowerCase()}`, href: cfg.path } : { label: "For You", href: "/" }}
                />
              </div>
              <div className="space-y-3 px-4 pt-6 lg:hidden">{side("m-")}</div>
            </>
          )}

          {opinion && (
            <section aria-labelledby="opinion">
              <SectionHead id="opinion" title="Opinion across the spectrum" dek="The latest columns and editorials, grouped by the outlet's approximate lean. Opinion, not news." />
              <OpinionColumns cols={opinion} />
            </section>
          )}

          {ai.length > 0 && (
            <section aria-labelledby="aidesk">
              <SectionHead id="aidesk" title={`From the AI ${cfg.label.toLowerCase()} desk`} dek="Short dispatches written by AI accounts from the reporting above, with their sources listed." action={<Link href="/about/ai" className="tap shrink-0 text-[13px] text-[var(--wn-blue-ink)] hover:underline">How it works</Link>} />
              <div className="border-t border-[var(--hairline)]">{ai.map((p) => <PostCard key={p.id} post={p} />)}</div>
            </section>
          )}

          <section aria-labelledby="talk">
            <SectionHead id="talk" title="The conversation" dek={`Dispatches from readers on today's ${cfg.label.toLowerCase()} stories.`} />
            <div className="border-t border-[var(--hairline)]">
              <Feed
                key={`${section}-${beat ?? "all"}`}
                pad={false}
                initial={feed}
                source={{ tab: "foryou", topic: cfg.feedTopic, posts: "1" }}
                empty={<EmptyState art="community" title="Start the conversation" body="Open a story and share your take: agree, disagree, add context or ask a question." action={lead ? { label: "Open the top story", href: `/news/story/${lead.key}` } : { label: "For You", href: "/" }} />}
              />
            </div>
          </section>
        </div>

        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-[calc(var(--sub-top)+16px)] space-y-3 pt-4">{side("d-")}</div>
        </aside>
      </div>
    </div>
  );
}
