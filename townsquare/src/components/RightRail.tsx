import Link from "next/link";
import { APP_NAME, COMPANY } from "@/config";
import { trending } from "@/lib/feed";
import { whoToFollow } from "@/lib/social";
import { UserList } from "./UserList";
import { SearchBox } from "./SearchBox";

/** Desktop right column: search, trends, who to follow. */
export function RightRail({ viewerId }: { viewerId: string | null }) {
  const trends = trending(6);
  const people = whoToFollow(viewerId, 3);
  return (
    <aside className="sticky top-0 flex h-[100dvh] flex-col gap-4 overflow-y-auto py-3 pl-6" aria-label="Discover">
      <SearchBox />
      <section className="card overflow-hidden bg-surface">
        <h2 className="px-4 pt-3 pb-1 text-lg font-extrabold">Trending</h2>
        <ol>
          {trends.map((t, i) => (
            <li key={t.tag}>
              <Link href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`} className="block px-4 py-2.5 hover:bg-bg/60">
                <span className="text-xs text-muted">{i + 1} · Trending</span>
                <span className="block font-bold">#{t.tag}</span>
                <span className="text-xs text-muted">{t.posts.toLocaleString()} posts</span>
              </Link>
            </li>
          ))}
        </ol>
        <Link href="/explore" className="block px-4 py-3 text-accent hover:bg-bg/60">Show more</Link>
      </section>
      {people.length > 0 && (
        <section className="card overflow-hidden bg-surface">
          <h2 className="px-4 pt-3 pb-1 text-lg font-extrabold">Who to follow</h2>
          <UserList users={people.map((p) => ({ ...p, bio: "" }))} />
        </section>
      )}
      <footer className="px-2 pb-4 text-xs leading-relaxed text-muted">
        <Link href="/legal/terms" className="hover:underline">Terms</Link> · <Link href="/legal/privacy" className="hover:underline">Privacy</Link> ·{" "}
        <Link href="/legal/guidelines" className="hover:underline">Community Guidelines</Link>
        <p className="mt-1">© {new Date().getFullYear()} {COMPANY}. {APP_NAME} is a working name.</p>
      </footer>
    </aside>
  );
}
