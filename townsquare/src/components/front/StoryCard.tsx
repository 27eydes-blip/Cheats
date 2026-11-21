import Link from "next/link";
import type { StorySummary } from "@/lib/news";
import { Time } from "../Time";
import { CategoryTag, LiveBadge } from "../ui/Badge";
import { MiniSplit } from "../ui/Stance";
import { ClockIcon, FlameIcon } from "../icons";
import { StoryArt } from "./StoryArt";
import { TeamChips } from "../sports/TeamChips";
import { CoverageBar } from "../news/CoverageBar";
import { FeedImage } from "../news/FeedImage";

export const sectionName = (s: StorySummary) => (s.section === "Top Stories" ? "National" : s.section);

export function StatusTags({ s }: { s: StorySummary }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {s.status === "live" && <LiveBadge label="LIVE" />}
      <CategoryTag solid>{sectionName(s)}</CategoryTag>
      {s.status === "developing" && <CategoryTag className="!bg-[rgb(7_11_20/0.72)] !text-[#67e8f9] !ring-[rgb(34_211_238/0.45)]">Developing</CategoryTag>}
    </span>
  );
}

/** "2h ago · Harbor & Main" */
export function Meta({ s, className = "" }: { s: StorySummary; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3 ${className}`}>
      <ClockIcon size={13} /> <Time ms={s.updatedAt} /> ago
      {s.source && <><span aria-hidden="true">·</span><span className="truncate font-semibold text-ink-2">{s.source}</span></>}
    </span>
  );
}

/** Story card: large image, category tag, headline, time and source. */
export function StoryTile({ s, big, flat, rising }: { s: StorySummary; big?: boolean; /** inside another card */ flat?: boolean; /** show the trending flame */ rising?: boolean }) {
  return (
    <article className={`group min-w-0 overflow-hidden ${flat ? "" : "card card-hover"}`}>
      <Link href={`/news/story/${s.key}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden">
          <StoryArt seed={s.key} section={s.section} photo={s.photo} width={640} className="transition-transform duration-700 ease-out group-hover:scale-[1.05]" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[rgb(7_11_20/0.7)] via-transparent to-transparent" />
          <span className="absolute top-3 left-3"><StatusTags s={s} /></span>
          {rising && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-[6px] bg-[rgb(7_11_20/0.72)] px-2 py-[4px] text-[10.5px] leading-none font-extrabold tracking-[0.1em] text-[#22d3ee] uppercase ring-1 ring-[#22d3ee]/50 backdrop-blur-sm">
              <FlameIcon size={12} className="motion-safe:animate-pulse" /> Rising
            </span>
          )}
          {s.teams.length > 0 && <span className="absolute bottom-3 left-3"><TeamChips teams={s.teams} onImage linked={false} /></span>}
        </div>
        <div className="p-4">
          <h3 className={`font-display leading-[1.04] font-bold text-balance text-ink-1 transition-colors group-hover:text-[var(--wn-cyan-ink)] ${big ? "text-[clamp(1.5rem,1.2rem+0.9vw,2rem)]" : "text-[clamp(1.3rem,1.15rem+0.5vw,1.6rem)]"}`}>{s.title}</h3>
          {big && <p className="mt-2 line-clamp-2 text-[14.5px] text-ink-2">{s.summary}</p>}
          <Meta s={s} className="mt-3" />
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
        <MiniSplit split={s.split} />
        <span className="mono text-[11.5px] text-ink-3">{s.takes} dispatches</span>
      </div>
    </article>
  );
}


/**
 * A story in the timeline: a flat row with a small side thumbnail, not a card.
 * Quiet by design: gray meta text, no overlays, no pulsing, no colored numbers.
 */
export function StoryRow({ s, rising, lead }: { s: StorySummary; rising?: boolean; /** the top story of the moment */ lead?: boolean }) {
  const href = `/news/story/${s.key}`;
  return (
    <div className="group flex gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Link href={href} className="block">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[19px] text-ink-3">
            <span className="shrink-0 font-semibold text-ink-2">{lead ? "Top story" : sectionName(s)}</span>
            {s.status === "live" && <><span aria-hidden="true">·</span><span className="shrink-0">Live</span></>}
            {s.status === "developing" && s.origin === "demo" && <><span aria-hidden="true">·</span><span className="shrink-0">Developing</span></>}
            {rising && <><span aria-hidden="true">·</span><span className="inline-flex shrink-0 items-center gap-0.5"><FlameIcon size={12} /> Rising</span></>}
            <span aria-hidden="true">·</span>
            <span className="shrink-0"><Time ms={s.updatedAt} /></span>
          </span>
          <h3 className="mt-0.5 line-clamp-3 text-[15px] leading-[21px] font-semibold text-ink-1 group-hover:underline">{s.title}</h3>
          {lead && s.summary && <span className="mt-0.5 line-clamp-2 block text-[14px] leading-[20px] text-ink-2">{s.summary}{s.summarySource && <span className="text-ink-3"> ({s.summarySource})</span>}</span>}
          {s.origin === "demo" && (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
              {s.source && <span className="truncate">{s.source}</span>}
              {s.source && <span aria-hidden="true">·</span>}
              <span className="shrink-0">{s.takes} dispatch{s.takes === 1 ? "" : "es"}</span>
            </span>
          )}
          {s.teams.length > 0 && <span className="mt-1.5 block"><TeamChips teams={s.teams} linked={false} /></span>}
        </Link>
        {s.coverage.total > 0 && <div className="mt-1.5"><CoverageBar storyKey={s.key} coverage={s.coverage} /></div>}
      </div>
      <Link href={href} tabIndex={-1} aria-hidden="true" className="relative mt-0.5 block h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[12px] ring-1 ring-[var(--hairline)] sm:h-[84px] sm:w-[112px]">
        <StoryArt seed={s.key} section={s.section} photo={s.photo} width={320} />
        {!s.photo && s.feedImage && <FeedImage url={s.feedImage.url} credit={s.feedImage.credit} showCredit={false} />}
      </Link>
    </div>
  );
}

/** Trending as a plain list for the home sidebar: no big numerals, no colored odds-style figures. */
export function TrendingList({ stories }: { stories: StorySummary[] }) {
  return (
    <section aria-label="Trending" className="rounded-[14px] border border-[var(--hairline)]">
      <h2 className="px-4 pt-3 pb-1 text-[17px] font-bold">Trending</h2>
      <ol>
        {stories.map((s, i) => (
          <li key={s.key}>
            <Link href={`/news/story/${s.key}`} className="group block px-4 py-2 hover:bg-white/[0.02]">
              <span className="block text-[12.5px] text-ink-3">{i + 1} · {sectionName(s)}</span>
              <span className="line-clamp-2 block text-[14.5px] leading-snug font-semibold text-ink-1 group-hover:underline">{s.title}</span>
              <span className="block text-[12.5px] text-ink-3">{s.takes} dispatch{s.takes === 1 ? "" : "es"}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/explore" className="block px-4 py-2.5 text-[14px] text-[var(--wn-blue-ink)] hover:underline">Show more</Link>
    </section>
  );
}
