import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { forYou } from "@/lib/foryou";
import { Feed } from "@/components/Feed";
import { SLUG_TOPIC, TOPIC_PAGE_LABEL } from "@/lib/feedtabs-meta";
import { EmptyState } from "@/components/ui/States";
import { StoryRow } from "@/components/front/StoryCard";
import { TimelineAside } from "@/components/front/TimelineAside";
import { ScoreStrip } from "@/components/sports/Games";
import { scoreboard } from "@/lib/sports/games";
import { tzOffsetMin } from "@/lib/sports/time";
import { viewerTz } from "@/lib/sports/viewer-tz";

export const dynamic = "force-dynamic";

const SECTION: Record<string, string> = { politics: "Politics", world: "World", markets: "Business", tech: "Tech", sports: "Sports", culture: "Culture", national: "Top Stories" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = SLUG_TOPIC[(await params).slug];
  return { title: t ? TOPIC_PAGE_LABEL[t] : "Topic" };
}

/** A topic's own page (from the top nav or Your Topics): its top story, then the topic-filtered timeline. */
export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const topic = SLUG_TOPIC[(await params).slug];
  if (!topic) notFound();
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const label = TOPIC_PAGE_LABEL[topic];
  const [lead] = listStories(1, { section: SECTION[topic], viewerId: vid });
  const now = Date.now();
  const tz = topic === "sports" ? await viewerTz() : null;
  const sb = tz ? scoreboard({ tzOffsetMin: tzOffsetMin(tz, now), t: now, upcomingLimit: 12, recentLimit: 8 }) : null;
  const strip = sb ? [...sb.live, ...sb.today, ...sb.upcoming, ...sb.recent].slice(0, 16) : null;
  const initial = forYou(vid, null, undefined, { topic, excludeStory: lead?.key });
  return (
    <div className="mx-auto max-w-[1080px] lg:px-6">
      <div className="grid lg:grid-cols-[minmax(0,640px)_minmax(0,330px)] lg:justify-center lg:gap-7">
        <div className="min-w-0 lg:min-h-screen lg:border-x lg:border-[var(--hairline)]">
          <header className="tl-row flex items-center justify-between gap-3 px-4 py-3">
            <h1 className="text-[20px] font-bold">{label}</h1>
            {topic === "sports" && <Link href="/sports" className="tap text-[14px] text-[var(--wn-blue-ink)] hover:underline">Scores and schedules</Link>}
          </header>
          {strip && <ScoreStrip games={strip} tz={tz!} now={now} />}
          <h2 className="sr-only">Latest in {label}</h2>
          {lead && <div role="article" aria-label={lead.title} className="tl-row"><StoryRow s={lead} lead /></div>}
          <Feed
            key={topic}
            pad={false}
            initial={initial}
            source={{ tab: "foryou", topic, ...(lead ? { exclude: lead.key } : {}) }}
            empty={<EmptyState art="news" title={`Quiet in ${label}`} body="Nothing new on this topic yet. For You has the latest across everything." action={{ label: "For You", href: "/" }} />}
          />
        </div>
        <TimelineAside viewerId={vid} section={SECTION[topic]} />
      </div>
    </div>
  );
}
