import Link from "next/link";
import { searchPosts, searchUsers, trending } from "@/lib/feed";
import { getViewer } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { PageHeader, Tabs } from "@/components/PageHeader";
import { SearchBox } from "@/components/SearchBox";
import { UserList } from "@/components/UserList";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const type = sp.type === "people" ? "people" : "posts";
  const viewer = await getViewer();
  const enc = encodeURIComponent(q);
  const isTag = q.startsWith("#");
  return (
    <>
      <PageHeader title={q ? (isTag ? q : "Search") : "Search"} subtitle={q && !isTag ? `Results for “${q}”` : isTag ? "Topic" : undefined} back={!!q}>
        <div className="px-4 py-2.5 sm:px-6">
          <SearchBox initial={q} autoFocus={!q} />
        </div>
        {q && (
          <Tabs
            active={type}
            tabs={[
              { key: "posts", label: "Posts", href: `/search?q=${enc}` },
              { key: "people", label: "People", href: `/search?q=${enc}&type=people` },
            ]}
          />
        )}
      </PageHeader>
      {!q ? (
        <section>
          <h2 className="px-4 pt-5 pb-2 font-display text-h3 font-semibold sm:px-6">Trending now</h2>
          <ol className="divide-y divide-line">
            {trending(10).map((t, i) => (
              <li key={t.tag}>
                <Link className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2/50 sm:px-6" href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`}>
                  <span className="num w-6 font-display text-[22px] font-semibold text-ink-3">{i + 1}</span>
                  <span className="flex-1"><span className="block font-semibold">#{t.tag}</span><span className="num text-[13px] text-ink-3">{t.posts} posts</span></span>
                  <Sparkline values={t.series} width={84} height={26} color={t.rising ? "var(--success)" : "var(--accent)"} />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : type === "people" ? (
        <UserList users={searchUsers(q, viewer?.id ?? null)} empty={`No people match “${q}”`} />
      ) : (
        <Feed initial={searchPosts(q, viewer?.id ?? null)} source={{ tab: "search", q }} empty={<EmptyState art="search" title={`No posts match “${q}”`} body="Try a different word or a #topic." />} />
      )}
    </>
  );
}
