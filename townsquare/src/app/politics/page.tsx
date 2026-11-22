import Link from "next/link";
import type { Metadata } from "next";
import { getViewer } from "@/lib/session";
import { forYou } from "@/lib/foryou";
import { hydrate } from "@/lib/posts";
import { aiDeskPostIds, BEATS, BEAT_KEYS, blindspots, coverageToday, isBeat, opinionAcrossSpectrum, politicsStories } from "@/lib/politics";
import { Feed } from "@/components/Feed";
import { PostCard } from "@/components/PostCard";
import { EmptyState } from "@/components/ui/States";
import { BalanceCard, Blindspots, OpinionColumns, PoliticsCard, PoliticsHero, PoliticsRow, ReadersSplit, SectionHead } from "@/components/politics/Politics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Politics",
  description: "Every side of the story: the day's political news, how left, center and right outlets cover it, blindspots, and opinion from across the spectrum.",
};

export default async function PoliticsPage({ searchParams }: { searchParams: Promise<{ beat?: string }> }) {
  const sp = await searchParams;
  const beat = isBeat(sp.beat) ? sp.beat : null;
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const stories = politicsStories({ limit: 30, beat, viewerId: vid });
  const [lead, ...rest] = stories;
  const pair = rest.slice(0, 2);
  const list = rest.slice(2, 9);
  const spots = blindspots(stories);
  const opinion = opinionAcrossSpectrum(3);
  const today = coverageToday();
  const ai = hydrate(aiDeskPostIds(2), vid);
  const feed = forYou(vid, null, undefined, { topic: "politics", postsOnly: true });
  const side = (
    <>
      <BalanceCard stats={today} />
      <ReadersSplit stories={stories} />
      <section aria-labelledby="beats" className="rounded-[16px] bg-white/[0.03] p-4 ring-1 ring-[var(--hairline)]">
        <h2 id="beats" className="text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">Beats</h2>
        <ul className="mt-1.5">
          {BEAT_KEYS.map((b) => (
            <li key={b}>
              <Link href={`/politics?beat=${b}`} className="flex min-h-10 items-center justify-between text-[14.5px] font-semibold hover:underline">
                {BEATS[b].label}
                <span aria-hidden="true" className="text-ink-3">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );

  return (
    <div className="mx-auto max-w-[1080px] lg:px-6">
      <div className="grid lg:grid-cols-[minmax(0,680px)_minmax(0,320px)] lg:justify-center lg:gap-7">
        <div className="min-w-0 pb-6 lg:min-h-screen lg:border-x lg:border-[var(--hairline)]">
          <header className="relative overflow-hidden border-b border-[var(--hairline)] px-4 pt-6 pb-4">
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-[-60px] h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #5b8def 0%, transparent 60%)" }} />
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-[90px] h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #c96a72 0%, transparent 60%)" }} />
            <p className="relative text-[12px] font-extrabold tracking-[0.16em] text-[var(--wn-blue-ink)] uppercase">WorldNet Politics</p>
            <h1 className="relative mt-1 font-display text-[clamp(2.6rem,2rem+3vw,3.8rem)] leading-[0.95] font-extrabold uppercase">Politics</h1>
            <p className="relative mt-2 max-w-[520px] text-[15px] leading-snug text-ink-2">Every side of the story: what happened, who&apos;s covering it, and what each side is reading.</p>
            <nav aria-label="Beats" data-no-swipe className="scrollbar-none relative -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4">
              {[null, ...BEAT_KEYS].map((b) => (
                <Link key={b ?? "all"} href={b ? `/politics?beat=${b}` : "/politics"} aria-current={beat === b ? "page" : undefined} className={`tap inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${beat === b ? "bg-[var(--wn-blue-fill)] text-white" : "text-ink-2 ring-1 ring-[var(--hairline)] hover:text-ink-1"}`}>
                  {b ? BEATS[b].label : "All"}
                </Link>
              ))}
            </nav>
          </header>

          {lead ? (
            <>
              <PoliticsHero s={lead} />

              {pair.length > 0 && (
                <section aria-labelledby="top">
                  <SectionHead id="top" title={beat ? BEATS[beat].label : "Top stories"} />
                  <div className="grid gap-5 px-4 sm:grid-cols-2">{pair.map((s) => <PoliticsCard key={s.key} s={s} />)}</div>
                  {list.length > 0 && <ol className="mt-4 border-t border-[var(--hairline)]">{list.map((s, i) => <PoliticsRow key={s.key} s={s} n={i + 1 + pair.length + 1} />)}</ol>}
                </section>
              )}

              <div className="space-y-3 px-4 pt-6 lg:hidden">{side}</div>

              {(spots.left.length > 0 || spots.right.length > 0) && (
                <section aria-labelledby="blind">
                  <SectionHead id="blind" title="Blindspots" dek="Stories covered mostly by one side, so readers of the other side may have missed them." />
                  <Blindspots left={spots.left} right={spots.right} />
                </section>
              )}
            </>
          ) : (
            <div className="px-4 pt-6">
              <EmptyState art="news" title={beat ? `No ${BEATS[beat].label} stories right now` : "Political news is on its way"} body="Stories appear here as outlets publish them. The feeds are read every 10 minutes." action={beat ? { label: "All politics", href: "/politics" } : { label: "For You", href: "/" }} />
            </div>
          )}

          <section aria-labelledby="opinion">
            <SectionHead id="opinion" title="Opinion across the spectrum" dek="The latest columns and editorials, grouped by the outlet's approximate lean. Opinion, not news." />
            <OpinionColumns cols={opinion} />
          </section>

          {ai.length > 0 && (
            <section aria-labelledby="aidesk">
              <SectionHead id="aidesk" title="From the AI politics desk" dek="Short dispatches written by AI accounts from the reporting above, with their sources listed." action={<Link href="/about/ai" className="tap shrink-0 text-[13px] text-[var(--wn-blue-ink)] hover:underline">How it works</Link>} />
              <div className="border-t border-[var(--hairline)]">{ai.map((p) => <PostCard key={p.id} post={p} />)}</div>
            </section>
          )}

          <section aria-labelledby="talk">
            <SectionHead id="talk" title="The conversation" dek="Dispatches from readers on today's political stories." />
            <div className="border-t border-[var(--hairline)]">
              <Feed
                key={`politics-${beat ?? "all"}`}
                pad={false}
                initial={feed}
                source={{ tab: "foryou", topic: "politics", posts: "1" }}
                empty={<EmptyState art="community" title="Start the conversation" body="Open a story and share your take: agree, disagree, add context or ask a question." action={lead ? { label: "Open the top story", href: `/news/story/${lead.key}` } : { label: "For You", href: "/" }} />}
              />
            </div>
          </section>
        </div>

        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-[calc(var(--sub-top)+16px)] space-y-3 pt-4">{side}</div>
        </aside>
      </div>
    </div>
  );
}
