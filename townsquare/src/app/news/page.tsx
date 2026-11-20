import { latestNews, listStories, NEWS_SECTIONS } from "@/lib/news";
import { PageHeader } from "@/components/PageHeader";
import { HeadlineRow, StoryCard } from "@/components/news/StoryCard";
import { LinkArt } from "@/components/post/LinkCard";
import { Kicker, SourceLabel } from "@/components/ui/Badge";
import { ChipLink, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/States";
import { Time } from "@/components/Time";

export const dynamic = "force-dynamic";
export const metadata = { title: "News" };

const LABEL: Record<string, string> = { "Top Stories": "Top" };

export default async function News({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = (await searchParams).s;
  const section = NEWS_SECTIONS.find((x) => x === s) ?? "Top Stories";
  const items = latestNews(section, 40);
  const stories = listStories(10).filter((x) => x.status !== "ended" && (section === "Top Stories" || x.section === section));
  const [lead, ...restItems] = items;
  const grid = restItems.slice(0, 4);
  const more = restItems.slice(4);

  return (
    <>
      <PageHeader title="News" kicker={<Kicker>The Newsroom</Kicker>} subtitle="Every headline links to its original outlet">
        <div className="py-2.5">
          <ChipRow label="News sections">
            {NEWS_SECTIONS.map((x) => (
              <ChipLink key={x} href={x === "Top Stories" ? "/news" : `/news?s=${encodeURIComponent(x)}`} active={x === section}>
                {LABEL[x] ?? x}
              </ChipLink>
            ))}
          </ChipRow>
        </div>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState art="news" title={`No ${section} headlines yet`} body="New stories land here as outlets publish them." />
      ) : (
        <div className="pb-6">
          {stories[0] && (
            <section aria-label="Live story" className="px-4 pt-4 sm:px-6">
              <StoryCard story={stories[0]} size="lg" />
            </section>
          )}

          {lead && (
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="group block px-4 pt-5 sm:px-6">
              <div className="overflow-hidden rounded-[var(--r-xl)] ring-1 ring-line">
                <div className="aspect-[16/8] overflow-hidden">
                  <LinkArt seed={lead.url} className="transition-transform duration-700 group-hover:scale-[1.03]" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <SourceLabel name={lead.source} size="md" />
                <span className="text-[13px] text-ink-3">· <Time ms={lead.publishedAt} /></span>
                <Kicker className="ml-auto">{lead.section}</Kicker>
              </div>
              <h2 className="mt-2 font-display text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-[1.08] font-semibold text-balance group-hover:underline">{lead.title}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{lead.summary}</p>
            </a>
          )}

          {grid.length > 0 && (
            <section aria-label="More top stories" className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 border-t border-line px-4 pt-5 sm:gap-x-5 sm:px-6">
              {grid.map((n) => (
                <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="aspect-[4/3] overflow-hidden rounded-[var(--r-lg)] ring-1 ring-line">
                    <LinkArt seed={n.url} className="transition-transform duration-700 group-hover:scale-[1.04]" />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5"><SourceLabel name={n.source} /></div>
                  <h3 className="mt-1 line-clamp-3 font-display text-[17px] leading-snug font-semibold group-hover:underline sm:text-[18.5px]">{n.title}</h3>
                  <p className="mt-1 text-[12.5px] text-ink-3"><Time ms={n.publishedAt} /> · {n.section}</p>
                </a>
              ))}
            </section>
          )}

          {stories.length > 1 && (
            <section aria-labelledby="developing" className="mt-7 border-t border-line pt-5">
              <h2 id="developing" className="flex items-center gap-2 px-4 pb-3 font-display text-h3 font-semibold sm:px-6">
                <span className="h-2 w-2 animate-live rounded-full bg-live" /> Developing stories
              </h2>
              <div className="scrollbar-none flex snap-x gap-3 overflow-x-auto px-4 sm:px-6" data-no-swipe>
                {stories.slice(1).map((st) => (
                  <div key={st.key} className="w-[78%] shrink-0 snap-start sm:w-[46%]"><StoryCard story={st} /></div>
                ))}
              </div>
            </section>
          )}

          {more.length > 0 && (
            <section aria-labelledby="more" className="mt-7 border-t border-line">
              <h2 id="more" className="px-4 pt-5 pb-1 font-display text-h3 font-semibold sm:px-6">More headlines</h2>
              <div className="divide-y divide-line">{more.map((n, i) => <HeadlineRow key={n.id} n={n} rank={i + 1} />)}</div>
            </section>
          )}
          <p className="mx-4 mt-6 rounded-[var(--r-md)] bg-surface-2 px-4 py-3 text-[12.5px] text-ink-3 sm:mx-6">
            Preview data: sample headlines from fictional outlets. Stage 2 pulls real headlines from outlets&apos; RSS feeds, showing only titles and short snippets with a link back.
          </p>
        </div>
      )}
    </>
  );
}
