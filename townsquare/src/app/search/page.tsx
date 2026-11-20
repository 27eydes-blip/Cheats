import { searchPosts, searchUsers, trending } from "@/lib/feed";
import { getViewer } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { PageHeader, Tabs } from "@/components/PageHeader";
import { SearchBox } from "@/components/SearchBox";
import { UserList } from "@/components/UserList";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const type = sp.type === "people" ? "people" : "posts";
  const viewer = await getViewer();
  const enc = encodeURIComponent(q);
  return (
    <>
      <PageHeader title="Search" back>
        <div className="px-4 pb-3">
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
          <h2 className="px-4 pt-4 pb-2 text-lg font-extrabold">Trending now</h2>
          <ul>
            {trending(10).map((t) => (
              <li key={t.tag}>
                <Link className="block px-4 py-2.5 hover:bg-surface" href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`}>
                  <span className="font-bold">#{t.tag}</span> <span className="text-sm text-muted">· {t.posts} posts</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : type === "people" ? (
        <UserList users={searchUsers(q, viewer?.id ?? null)} empty={`No people match "${q}".`} />
      ) : (
        <Feed initial={searchPosts(q, viewer?.id ?? null)} source={{ tab: "search", q }} empty={`No posts match "${q}".`} />
      )}
    </>
  );
}
