import Link from "next/link";
import { all } from "@/lib/db";
import { searchPosts, searchUsers } from "@/lib/feed";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { SearchBox } from "@/components/SearchBox";
import { UserList } from "@/components/UserList";
import { Kicker, LiveBadge } from "@/components/ui/Badge";
import { ChipLink, ChipRow } from "@/components/ui/Chip";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { MiniSplit } from "@/components/ui/Stance";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const TYPES = [["all", "All"], ["stories", "Stories"], ["voices", "Voices"], ["desks", "Desks"], ["takes", "Takes"]] as const;

/** Full search results, grouped: Stories, Voices, Desks, Takes. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const type = TYPES.find(([k]) => k === sp.type)?.[0] ?? (sp.type === "people" ? "voices" : "all");
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const ql = q.toLowerCase().replace(/^#/, "");
  const stories = q ? listStories(50, { viewerId: vid }).filter((s) => `${s.title} ${s.summary} ${s.section} ${s.tag}`.toLowerCase().includes(ql)) : [];
  const like = `%${ql.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const desks = q ? all<{ slug: string; name: string; description: string }>("SELECT slug, name, description FROM communities WHERE visibility = 'public' AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')", [like, like]).map((d) => ({ ...d })) : [];
  const people = q ? searchUsers(q, vid, type === "voices" ? 30 : 5) : [];
  const takes = q ? searchPosts(q, vid) : null;
  const enc = encodeURIComponent(q);
  const want = (t: string) => type === "all" || type === t;

  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Search</Kicker>} title={q ? `“${q}”` : "Search the network"} />
      <div className="sticky-sub z-20 space-y-2.5 border-b border-rule bg-paper px-4 py-3 sm:px-6">
        <SearchBox initial={q} autoFocus={!q} />
        {q && (
          <ChipRow label="Filter results">
            {TYPES.map(([k, l]) => <ChipLink key={k} href={`/search?q=${enc}${k === "all" ? "" : `&type=${k}`}`} active={type === k}>{l}</ChipLink>)}
          </ChipRow>
        )}
      </div>
      {!q ? (
        <EmptyState art="search" title="What are you looking for?" body="Search stories, Voices, Desks, and takes. Tip: press ⌘K anywhere." />
      ) : (
        <div className="pb-6">
          {want("stories") && stories.length > 0 && (
            <section className="px-4 pt-6 sm:px-6" aria-label="Stories">
              <h2 className="folio border-b-2 border-navy-ink pb-1.5 text-navy-ink">Stories</h2>
              <ul>{stories.map((s) => (
                <li key={s.key} className="border-b border-rule py-3"><Link href={`/news/story/${s.key}`} className="group block">
                  <span className="flex items-center gap-2">{s.status === "live" && <LiveBadge label="LIVE" />}<Kicker tone="muted">{s.section === "Top Stories" ? "National" : s.section}</Kicker></span>
                  <span className="mt-1 block font-display text-[20px] leading-snug font-semibold group-hover:underline">{s.title}</span>
                  <MiniSplit split={s.split} className="mt-2" />
                </Link></li>
              ))}</ul>
            </section>
          )}
          {want("voices") && people.length > 0 && (
            <section className="pt-6" aria-label="Voices"><h2 className="folio mx-4 border-b-2 border-navy-ink pb-1.5 text-navy-ink sm:mx-6">Voices</h2><UserList users={people} /></section>
          )}
          {want("desks") && desks.length > 0 && (
            <section className="px-4 pt-6 sm:px-6" aria-label="Desks">
              <h2 className="folio border-b-2 border-navy-ink pb-1.5 text-navy-ink">Desks</h2>
              <ul>{desks.map((d) => <li key={d.slug} className="border-b border-rule py-3"><Link href={`/c/${d.slug}`} className="group block"><span className="font-display text-[19px] font-semibold group-hover:underline">{d.name}</span><span className="block text-[14px] text-ink-2">{d.description}</span></Link></li>)}</ul>
            </section>
          )}
          {want("takes") && takes && (
            <section className="pt-6" aria-label="Takes">
              <h2 className="folio mx-4 border-b-2 border-navy-ink pb-1.5 text-navy-ink sm:mx-6">Takes</h2>
              <Feed initial={takes} source={{ tab: "search", q }} empty={<p className="px-6 py-8 text-center text-ink-3">No takes match.</p>} />
            </section>
          )}
          {!stories.length && !people.length && !desks.length && !takes?.items.length && <EmptyState art="search" title="Nothing on the wire" body={`No stories, Voices, Desks, or takes match “${q}”.`} />}
        </div>
      )}
    </Frame>
  );
}
