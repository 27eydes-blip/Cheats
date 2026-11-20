import Link from "next/link";
import type { NewsItemView, StorySummary } from "@/lib/news";
import { LinkArt } from "../post/LinkCard";
import { Kicker, LiveBadge, SourceLabel } from "../ui/Badge";
import { Time } from "../Time";

/** A developing/live story as a bold card with a timeline count and outlet count. */
export function StoryCard({ story, size = "md" }: { story: StorySummary; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <Link href={`/news/story/${story.key}`} className="group relative block overflow-hidden rounded-[var(--r-xl)] bg-[var(--ticker-bg)] text-white ring-1 ring-line">
      <div className={`${lg ? "aspect-[16/10] sm:aspect-[2/1]" : "aspect-[16/9]"} opacity-80 transition-transform duration-700 group-hover:scale-[1.03]`}>
        <LinkArt seed={story.key + story.section} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          {story.status === "live" ? <LiveBadge /> : <span className="kicker text-white/75">{story.status === "developing" ? "Developing" : "Story"}</span>}
          <span className="kicker text-white/75">{story.section}</span>
        </div>
        <h3 className={`mt-1.5 font-display font-semibold text-balance ${lg ? "text-[clamp(1.5rem,1.1rem+1.8vw,2.25rem)] leading-[1.08]" : "text-[20px] leading-tight"}`}>{story.title}</h3>
        {lg && <p className="mt-2 line-clamp-2 max-w-xl text-[15px] text-white/80">{story.summary}</p>}
        <p className="num mt-2 text-[12.5px] text-white/70">
          {story.updates} updates · {story.outlets} outlets · updated <Time ms={story.updatedAt} /> ago
        </p>
      </div>
    </Link>
  );
}

/** Compact headline row with outlet label (used in lists and the Breaking tab). */
export function HeadlineRow({ n, rank }: { n: NewsItemView; rank?: number }) {
  return (
    <a href={n.url} target="_blank" rel="noopener noreferrer" className="group flex gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-6">
      {rank !== undefined && <span className="num w-6 shrink-0 pt-0.5 font-display text-[26px] leading-none font-semibold text-ink-3/70">{rank}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><SourceLabel name={n.source} /><span className="text-[12.5px] text-ink-3">· <Time ms={n.publishedAt} /></span></span>
        <span className="mt-1 block font-display text-[18px] leading-snug font-semibold text-balance group-hover:underline">{n.title}</span>
        <span className="mt-1 block"><Kicker tone="muted">{n.section}</Kicker></span>
      </span>
    </a>
  );
}
