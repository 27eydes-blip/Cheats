import { latestNews, listStories, NEWS_SECTIONS } from "@/lib/news";
import { StoryArt } from "@/components/front/StoryArt";
import { Kicker, SourceLabel } from "@/components/ui/Badge";
import { ChipLink, ChipRow } from "@/components/ui/Chip";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { EmptyState } from "@/components/ui/States";
import { Time } from "@/components/Time";
import { StoryTile } from "@/components/front/Tiles";

export const dynamic = "force-dynamic";
export const metadata = { title: "From the outlets" };

/** The news hub: headlines from outlets (link out, never full text), by section. */
export default async function News({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = (await searchParams).s;
  const section = NEWS_SECTIONS.find((x) => x === s) ?? "Top Stories";
  const items = latestNews(section, 40);
  const stories = listStories(3, { section });
  const [lead, ...rest] = items;
  return (
    <Frame width="wide">
      <PageTitle folio={<Kicker tone="gold">News hub</Kicker>} title="From the outlets" dek="Headlines and short snippets from news outlets, always with a link back to the original." />
      <div className="sticky-sub z-20 border-b border-rule bg-paper px-4 py-2.5 sm:px-6">
        <ChipRow label="Sections">{NEWS_SECTIONS.map((x) => <ChipLink key={x} href={x === "Top Stories" ? "/news" : `/news?s=${encodeURIComponent(x)}`} active={x === section}>{x === "Top Stories" ? "All" : x}</ChipLink>)}</ChipRow>
      </div>
      {!lead ? <EmptyState art="news" title={`No ${section} headlines yet`} /> : (
        <div className="grid gap-10 px-4 pt-6 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="group block border-t-[3px] border-navy-ink pt-3">
              <div className="aspect-[16/8] overflow-hidden"><StoryArt seed={lead.url} section={lead.section} /></div>
              <div className="mt-3 flex items-center gap-2"><SourceLabel name={lead.source} size="md" /><span className="mono text-[11px] text-ink-3"><Time ms={lead.publishedAt} /></span></div>
              <h2 className="mt-2 font-display text-display font-semibold text-balance group-hover:underline">{lead.title}</h2>
              <p className="mt-2 text-[16px] text-ink-2">{lead.summary}</p>
            </a>
            <ul className="mt-8 grid gap-x-8 sm:grid-cols-2">
              {rest.map((n) => (
                <li key={n.id} className="border-t border-rule py-3">
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="group block">
                    <span className="flex items-center gap-2"><SourceLabel name={n.source} /><span className="mono text-[10.5px] text-ink-3"><Time ms={n.publishedAt} /></span></span>
                    <span className="mt-1 block font-display text-[18px] leading-snug font-semibold group-hover:underline">{n.title}</span>
                    <Kicker tone="muted" className="mt-1 block">{n.section}</Kicker>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <aside className="space-y-8 lg:col-span-4">
            <p className="folio text-navy-ink">Stories to argue about</p>
            {stories.map((st) => <StoryTile key={st.key} s={st} />)}
          </aside>
        </div>
      )}
      <p className="mx-4 mt-8 border-l-2 border-rule-strong bg-paper-2 px-4 py-3 text-[12.5px] text-ink-3 sm:mx-6">Sample headlines from fictional outlets. Stage 2 pulls real headlines from RSS feeds, showing titles and short snippets only, with a link back.</p>
    </Frame>
  );
}
