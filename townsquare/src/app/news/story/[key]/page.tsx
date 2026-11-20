import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStory } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { debates, storyTakes } from "@/lib/takes";
import { DebateCard } from "@/components/front/DebateCard";
import { StoryArt } from "@/components/front/StoryArt";
import { TakesBoard } from "@/components/story/TakesBoard";
import { NewTakes } from "@/components/story/NewTakes";
import { Avatar } from "@/components/ui/Avatar";
import { Kicker, LiveBadge, SourceLabel, VerifiedSeal } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { StanceMeter } from "@/components/ui/Stance";
import { LocalDate, Time } from "@/components/Time";
import { StoryActions } from "./StoryActions";
import { StoryTickers } from "@/components/markets/LiveQuotes";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { storyTickers } from "@/lib/markets/storyTickers";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const s = getStory((await params).key);
  return { title: s?.title ?? "Story", description: s?.summary };
}

export default async function StoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const viewer = await getViewer();
  const story = getStory(key, viewer?.id ?? null);
  if (!story) notFound();
  const takes = storyTakes(key, viewer?.id ?? null);
  const fights = debates(viewer?.id ?? null, 2, key);
  const voices = [...new Map(takes.filter((t) => t.author.verified).map((t) => [t.author.id, t.author])).values()].slice(0, 3);
  const section = story.section === "Top Stories" ? "National" : story.section;
  const tickers = storyTickers(key);
  const tickerQuotes = tickers.length ? await getQuotes(tickers) : [];

  return (
    <article className="mx-auto max-w-[1320px]">
      <header className="px-4 pt-6 lg:px-8 lg:pt-10">
        <div className="flex flex-wrap items-center gap-2">
          {story.status === "live" ? <LiveBadge label="LIVE UPDATES" /> : <Kicker tone={story.status === "developing" ? "gold" : "muted"}>{story.status === "developing" ? "Developing" : "Final"}</Kicker>}
          <Link href={`/?c=${encodeURIComponent(story.section)}`} className="folio text-ink-3 hover:text-navy-ink">{section}</Link>
        </div>
        <h1 className="mt-3 max-w-[1040px] font-display text-mega font-semibold text-balance">{story.title}</h1>
        <p className="mt-4 max-w-[760px] font-display text-[clamp(1.15rem,1rem+0.6vw,1.45rem)] leading-snug text-ink-2 italic">{story.summary}</p>
        <p className="mono mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-rule py-2 text-[11.5px] text-ink-3">
          <span>UPDATED <Time ms={story.updatedAt} /> AGO</span><span>{story.updates.length} UPDATES</span><span>{story.outlets} OUTLETS</span><span>{story.takes} TAKES</span><span>+{story.velocity} IN 6H</span>
        </p>
      </header>

      <div className="grid gap-10 px-4 pt-6 lg:grid-cols-12 lg:px-8">
        <div className="min-w-0 lg:col-span-8">
          <div className="aspect-[16/8] overflow-hidden"><StoryArt seed={story.key} section={story.section} photo={story.photo} priority /></div>
          {tickerQuotes.length > 0 && <StoryTickers initial={tickerQuotes} mode={marketMode()} />}

          {/* Timeline rail */}
          <section aria-labelledby="timeline" className="mt-8">
            <h2 id="timeline" className="folio border-t-2 border-navy-ink pt-3 text-navy-ink">Timeline</h2>
            <ol className="mt-4">
              {story.updates.map((u, i) => (
                <li key={u.id} className="grid grid-cols-[72px_1fr] gap-4 sm:grid-cols-[96px_1fr]">
                  <p className="mono pt-0.5 text-right text-[11.5px] text-ink-3">
                    {i === 0 && story.status === "live" && <span className="block font-bold text-live-bg dark:text-live">LATEST</span>}
                    <LocalDate ms={u.createdAt} options={{ hour: "numeric", minute: "2-digit" }} />
                  </p>
                  <div className="relative border-l-2 border-rule pb-6 pl-5">
                    <span aria-hidden="true" className={`absolute top-1.5 -left-[7px] h-3 w-3 ${i === 0 && story.status === "live" ? "animate-live rounded-full bg-live" : u.kind === "key" ? "bg-gold" : "rounded-full border-2 border-rule-strong bg-paper"}`} />
                    {u.kind === "quote" ? (
                      <blockquote className="font-display text-[clamp(1.3rem,1.1rem+0.8vw,1.75rem)] leading-snug text-navy-ink italic">{u.body}</blockquote>
                    ) : (
                      <p className={`leading-relaxed ${u.kind === "key" ? "font-display text-[20px] font-semibold" : "text-[16px] text-ink-2"}`}>{u.body}</p>
                    )}
                    <div className="mt-2 text-[12.5px] text-ink-3">
                      {u.author ? (
                        <Link href={`/u/${u.author.handle}`} className="inline-flex items-center gap-1.5 hover:underline">
                          <Avatar url={u.author.avatarUrl} name={u.author.displayName} handle={u.author.handle} size={20} />
                          <span className="font-semibold text-ink-2">{u.author.displayName}</span>{u.author.verified && <VerifiedSeal size={12} />}
                        </Link>
                      ) : u.source ? <SourceLabel name={u.source} /> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* How it is covered */}
          {story.coverage.length > 0 && (
            <section aria-labelledby="coverage" className="mt-6">
              <div className="flex items-baseline justify-between border-t-2 border-navy-ink pt-3">
                <h2 id="coverage" className="folio text-navy-ink">How it is covered</h2>
                <span className="mono text-[11px] text-ink-3">{new Set(story.coverage.map((c) => c.source)).size} OUTLETS, SIDE BY SIDE</span>
              </div>
              <ul className="scrollbar-none mt-4 grid auto-cols-[78%] grid-flow-col gap-0 overflow-x-auto sm:auto-cols-[40%] lg:auto-cols-fr" data-no-swipe>
                {story.coverage.map((c, i) => (
                  <li key={c.id} className={`min-w-0 ${i ? "border-l border-rule" : ""} px-4 first:pl-0`}>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="group block">
                      <SourceLabel name={c.source} size="md" />
                      <h3 className="mt-3 font-display text-[19px] leading-snug font-semibold group-hover:underline">{c.title}</h3>
                      <p className="mono mt-3 text-[11px] text-ink-3"><Time ms={c.publishedAt} /> AGO · READ AT SOURCE ↗</p>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* The split */}
        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(var(--sub-top)+20px)]">
            <section aria-labelledby="split" className="border-t-[3px] border-gold bg-paper-2 p-5">
              <h2 id="split" className="font-display text-h2 font-semibold">What&apos;s the split?</h2>
              <p className="mt-1 text-[13.5px] text-ink-3">Cast your stance. You can change it any time.</p>
              <div className="mt-4"><StanceMeter type="story" id={story.key} initial={story.split} variant="large" /></div>
              <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
                <span className="folio !text-[10px] text-ink-3">Takes, last 24h</span>
                <Sparkline values={story.series} width={120} height={28} color="var(--gold)" label="Takes per two hours" />
              </div>
              <StoryActions storyKey={story.key} title={story.title} />
            </section>
            {voices.length > 0 && (
              <section aria-labelledby="sv" className="mt-6 border-t-2 border-navy-ink pt-3">
                <h2 id="sv" className="folio text-navy-ink">Voices on this story</h2>
                <ul className="mt-2 divide-y divide-rule">
                  {voices.map((v) => (
                    <li key={v.id}><Link href={`/u/${v.handle}`} className="flex items-center gap-3 py-2.5 hover:underline"><Avatar url={v.avatarUrl} name={v.displayName} handle={v.handle} size={34} /><span className="font-semibold">{v.displayName}</span><VerifiedSeal size={13} /></Link></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>

      {fights.length > 0 && (
        <section aria-labelledby="debates" className="mt-12 px-4 lg:px-8">
          <h2 id="debates" className="folio border-t-2 border-navy-ink pt-3 text-navy-ink">Head to head</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">{fights.map((d) => <DebateCard key={d.left.id} d={d} />)}</div>
        </section>
      )}

      <section aria-labelledby="takes" className="mt-12 lg:px-8">
        <div className="flex items-end justify-between px-4 lg:px-0">
          <h2 id="takes" className="font-display text-display font-semibold">The Takes</h2>
          <span className="mono pb-2 text-[12px] text-ink-3">{takes.length} TAKES</span>
        </div>
        <NewTakes storyKey={key} />
        <div className="mt-4"><TakesBoard takes={takes} /></div>
      </section>
    </article>
  );
}
