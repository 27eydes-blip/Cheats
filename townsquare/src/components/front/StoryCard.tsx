import Link from "next/link";
import type { StorySummary } from "@/lib/news";
import { Time } from "../Time";
import { CategoryTag, LiveBadge } from "../ui/Badge";
import { MiniSplit } from "../ui/Stance";
import { ClockIcon } from "../icons";
import { StoryArt } from "./StoryArt";

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
export function StoryTile({ s, big }: { s: StorySummary; big?: boolean }) {
  return (
    <article className="card card-hover group min-w-0 overflow-hidden">
      <Link href={`/news/story/${s.key}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden">
          <StoryArt seed={s.key} section={s.section} photo={s.photo} width={640} className="transition-transform duration-700 ease-out group-hover:scale-[1.05]" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[rgb(7_11_20/0.7)] via-transparent to-transparent" />
          <span className="absolute top-3 left-3"><StatusTags s={s} /></span>
        </div>
        <div className="p-4">
          <h3 className={`font-display leading-[1.04] font-bold text-balance text-ink-1 transition-colors group-hover:text-[var(--wn-cyan-ink)] ${big ? "text-[clamp(1.5rem,1.2rem+0.9vw,2rem)]" : "text-[clamp(1.3rem,1.15rem+0.5vw,1.6rem)]"}`}>{s.title}</h3>
          {big && <p className="mt-2 line-clamp-2 text-[14.5px] text-ink-2">{s.summary}</p>}
          <Meta s={s} className="mt-3" />
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
        <MiniSplit split={s.split} />
        <span className="mono text-[11.5px] text-ink-3">{s.takes} takes</span>
      </div>
    </article>
  );
}

