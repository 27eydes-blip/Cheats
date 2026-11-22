import Link from "next/link";
import type { Coverage, Side } from "@/lib/newsroom/coverage";
import { BEATS, type OpinionItem, type PoliticsStory, type SideHeadline } from "@/lib/politics";
import type { StorySummary } from "@/lib/news";
import { Time } from "@/components/Time";
import { StoryArt } from "@/components/front/StoryArt";
import { FeedImage } from "@/components/news/FeedImage";
import { CoverageBar } from "@/components/news/CoverageBar";
import { SplitBar } from "@/components/ui/Stance";

/** Same muted colors as the coverage bar; every use also has a text label (color is never the only cue). */
export const SIDE_COLORS: Record<Side, string> = { left: "#5b8def", center: "#9aa3b5", right: "#c96a72" };
const SIDE_NAME: Record<Side, string> = { left: "Left", center: "Center", right: "Right" };
const SIDES: Side[] = ["left", "center", "right"];

export function SectionHead({ id, title, dek, action }: { id: string; title: string; dek?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pt-7 pb-3">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[22px] leading-none font-extrabold tracking-[0.02em] uppercase">{title}</h2>
        {dek && <p className="mt-1.5 text-[13.5px] text-ink-3">{dek}</p>}
      </div>
      {action}
    </div>
  );
}

function Art({ s, className }: { s: StorySummary; className: string }) {
  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <StoryArt seed={s.key} section={s.section} photo={s.photo} width={1200} hero />
      {!s.photo && s.feedImage && <FeedImage url={s.feedImage.url} credit={s.feedImage.credit} />}
    </span>
  );
}

function BeatTags({ s }: { s: PoliticsStory }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-extrabold tracking-[0.1em] uppercase">
      {s.status === "live" && <span className="text-live">● Live</span>}
      {s.beats.slice(0, 2).map((b) => <span key={b} className="text-[var(--wn-blue-ink)]">{BEATS[b].label}</span>)}
      {!s.beats.length && <span className="text-[var(--wn-blue-ink)]">Politics</span>}
      <span className="font-semibold tracking-normal normal-case text-ink-3"><Time ms={s.updatedAt} /></span>
    </span>
  );
}

/** "How it's covered": the newest headline from a Left, Center and Right-leaning outlet, side by side. */
export function SidesPanel({ sides, compact }: { sides: Partial<Record<Side, SideHeadline>>; compact?: boolean }) {
  if (!SIDES.some((x) => sides[x])) return null;
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
      {SIDES.map((side) => {
        const h = sides[side];
        return (
          <div key={side} className="relative overflow-hidden rounded-[12px] bg-white/[0.03] px-3 pt-3 pb-2.5 ring-1 ring-[var(--hairline)]">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: SIDE_COLORS[side] }} />
            <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold tracking-[0.1em] uppercase" style={{ color: SIDE_COLORS[side] }}>
              {SIDE_NAME[side]}{h ? <span className="truncate font-semibold tracking-normal normal-case text-ink-3">· {h.source}{h.opinion ? " (opinion)" : ""}</span> : null}
            </p>
            {h ? (
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[14.5px] leading-snug font-semibold text-ink-1 hover:underline">
                {h.title} <span aria-hidden="true" className="text-ink-3">↗</span>
              </a>
            ) : (
              <p className="mt-1 text-[13.5px] leading-snug text-ink-3">No {SIDE_NAME[side]}-leaning outlet in our feeds has covered this yet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The lead story: big art, a strong headline, summary, coverage balance and every side's headline. */
export function PoliticsHero({ s }: { s: PoliticsStory }) {
  const href = `/news/story/${s.key}`;
  return (
    <article aria-labelledby="lead-title" className="px-4 pt-4">
      <Link href={href} className="group block">
        <Art s={s} className="aspect-[16/9] rounded-[18px] ring-1 ring-[var(--hairline)]" />
        <div className="mt-3.5">
          <BeatTags s={s} />
          <h2 id="lead-title" className="mt-1.5 text-[clamp(1.55rem,1.2rem+1.6vw,2.25rem)] leading-[1.12] font-extrabold tracking-[-0.01em] text-ink-1 group-hover:underline">{s.title}</h2>
          {s.summary && <p className="mt-2 text-[16px] leading-[1.5] text-ink-2">{s.summary}{s.summarySource && <span className="text-ink-3"> ({s.summarySource})</span>}</p>}
        </div>
      </Link>
      {s.coverage.total > 0 && <div className="mt-3"><CoverageBar storyKey={s.key} coverage={s.coverage} size="md" /></div>}
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">How it&apos;s covered</p>
        <SidesPanel sides={s.sides} />
      </div>
    </article>
  );
}

/** A secondary story: art on top, headline, coverage bar. Used in the two-up grid. */
export function PoliticsCard({ s }: { s: PoliticsStory }) {
  return (
    <article className="min-w-0">
      <Link href={`/news/story/${s.key}`} className="group block">
        <Art s={s} className="aspect-[16/9] rounded-[14px] ring-1 ring-[var(--hairline)]" />
        <span className="mt-2.5 block"><BeatTags s={s} /></span>
        <h3 className="mt-1 line-clamp-3 text-[17px] leading-[1.28] font-bold text-ink-1 group-hover:underline">{s.title}</h3>
      </Link>
      {s.coverage.total > 0 && <div className="mt-2"><CoverageBar storyKey={s.key} coverage={s.coverage} /></div>}
    </article>
  );
}

/** A compact list row with the three sides as small dots of coverage. */
export function PoliticsRow({ s, n }: { s: PoliticsStory; n?: number }) {
  return (
    <li className="tl-row flex gap-3 px-4 py-3">
      {n !== undefined && <span aria-hidden="true" className="num w-6 shrink-0 pt-0.5 font-display text-[22px] leading-none font-extrabold text-ink-3">{n}</span>}
      <div className="min-w-0 flex-1">
        <Link href={`/news/story/${s.key}`} className="group block">
          <BeatTags s={s} />
          <h3 className="mt-0.5 line-clamp-3 text-[15.5px] leading-[1.35] font-semibold text-ink-1 group-hover:underline">{s.title}</h3>
        </Link>
        {s.coverage.total > 0 && <div className="mt-1.5"><CoverageBar storyKey={s.key} coverage={s.coverage} /></div>}
      </div>
      <Link href={`/news/story/${s.key}`} tabIndex={-1} aria-hidden="true" className="mt-0.5 block shrink-0">
        <Art s={s} className="h-[72px] w-[96px] rounded-[10px] ring-1 ring-[var(--hairline)]" />
      </Link>
    </li>
  );
}

/** Today's balance: stories, outlets and the left/center/right share of all political coverage. */
export function BalanceCard({ stats }: { stats: { stories: number; outlets: number; articles: number; coverage: Coverage } }) {
  const c = stats.coverage;
  if (!stats.stories) return null;
  const pct = (x: number) => Math.round(x * 100);
  return (
    <section aria-labelledby="balance" className="rounded-[16px] bg-white/[0.03] p-4 ring-1 ring-[var(--hairline)]">
      <h2 id="balance" className="text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">Today in politics</h2>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {[["Stories", stats.stories], ["Outlets", stats.outlets], ["Articles", stats.articles]].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="num font-display text-[26px] leading-none font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>
      {c.rated > 0 && (
        <>
          <div aria-hidden="true" className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            {SIDES.map((x) => (c.shares[x] > 0 ? <span key={x} style={{ width: `${c.shares[x] * 100}%`, background: SIDE_COLORS[x] }} /> : null))}
          </div>
          <p className="mt-2 flex justify-between text-[12.5px] text-ink-2">
            {SIDES.map((x) => (
              <span key={x}><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SIDE_COLORS[x] }} />{SIDE_NAME[x]} {pct(c.shares[x])}%</span>
            ))}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-ink-3">Share of outlets covering politics in the last 24 hours, by their approximate lean. <Link href="/help#news-sources" className="underline hover:text-ink-1">How leans are rated</Link></p>
        </>
      )}
    </section>
  );
}

/** Blindspots: stories mostly covered by one side, so readers of the other side may have missed them. */
export function Blindspots({ left, right }: { left: PoliticsStory[]; right: PoliticsStory[] }) {
  if (!left.length && !right.length) return null;
  const col = (side: "left" | "right", list: PoliticsStory[]) => (
    <div className="min-w-0 rounded-[14px] ring-1 ring-[var(--hairline)]">
      <p className="flex items-center gap-2 border-b border-[var(--hairline)] px-3.5 py-2.5 text-[13px] font-bold">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: SIDE_COLORS[side] }} />
        Mostly covered on the {SIDE_NAME[side].toLowerCase()}
      </p>
      {list.length ? (
        <ul>
          {list.map((s) => (
            <li key={s.key} className="border-b border-[var(--hairline)] last:border-0">
              <Link href={`/news/story/${s.key}`} className="block px-3.5 py-2.5 hover:bg-white/[0.03]">
                <span className="line-clamp-2 text-[14.5px] leading-snug font-semibold text-ink-1">{s.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-ink-3">{s.coverage.flag?.text} · {s.coverage.total} outlets</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 py-3 text-[13.5px] text-ink-3">Nothing lopsided right now.</p>
      )}
    </div>
  );
  return <div className="grid gap-2.5 px-4 sm:grid-cols-2">{col("left", left)}{col("right", right)}</div>;
}

/** Opinion from across the spectrum: the newest piece per outlet, in three columns. */
export function OpinionColumns({ cols }: { cols: Record<Side, OpinionItem[]> }) {
  if (!SIDES.some((s) => cols[s].length)) return null;
  return (
    <div className="grid gap-2.5 px-4 sm:grid-cols-3">
      {SIDES.map((side) => (
        <div key={side} className="min-w-0">
          <p className="mb-1.5 flex items-center gap-2 border-b-2 pb-1.5 text-[12px] font-extrabold tracking-[0.12em] uppercase" style={{ borderColor: SIDE_COLORS[side], color: SIDE_COLORS[side] }}>{SIDE_NAME[side]}</p>
          {cols[side].length ? (
            <ul className="space-y-0.5">
              {cols[side].map((o) => (
                <li key={o.url}>
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="block rounded-[8px] py-2 hover:bg-white/[0.03]">
                    <span className="block text-[12.5px] font-semibold text-ink-3">{o.source}</span>
                    <span className="line-clamp-3 text-[14.5px] leading-snug font-semibold text-ink-1">{o.title} <span aria-hidden="true" className="text-ink-3">↗</span></span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-[13.5px] text-ink-3">No recent opinion pieces from {SIDE_NAME[side]}-leaning outlets.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Where readers stand: agree / disagree / unsure on today's political stories. */
export function ReadersSplit({ stories }: { stories: PoliticsStory[] }) {
  const list = stories.filter((s) => s.split.total > 0).slice(0, 4);
  if (!list.length) return null;
  return (
    <section aria-labelledby="readers" className="rounded-[16px] bg-white/[0.03] p-4 ring-1 ring-[var(--hairline)]">
      <h2 id="readers" className="text-[12px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">Where readers stand</h2>
      <ul className="mt-2 space-y-3">
        {list.map((s) => {
          const t = s.split.total;
          return (
            <li key={s.key}>
              <Link href={`/news/story/${s.key}`} className="line-clamp-2 text-[14px] leading-snug font-semibold hover:underline">{s.title}</Link>
              <SplitBar split={s.split} className="mt-1.5" />
              <p className="mt-1 text-[12px] text-ink-3">{Math.round((s.split.agree / t) * 100)}% agree · {Math.round((s.split.disagree / t) * 100)}% disagree · {t} reader{t === 1 ? "" : "s"}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
