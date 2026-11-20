import Link from "next/link";
import { APP_NAME, COMPANY } from "@/config";
import { trending } from "@/lib/feed";
import { liveEvents } from "@/lib/news";
import { whoToFollow } from "@/lib/social";
import { Avatar } from "./ui/Avatar";
import { LiveBadge, VerifiedSeal } from "./ui/Badge";
import { Sparkline } from "./ui/Sparkline";
import { FollowButton } from "./FollowButton";
import { RailSearch } from "./shell/RailSearch";
import { TrendIcon } from "./icons";

/** Desktop right column: search, live now, trending with momentum, who to follow. */
export function RightRail({ viewerId }: { viewerId: string | null }) {
  const trends = trending(5);
  const people = whoToFollow(viewerId, 3);
  const live = liveEvents().filter((e) => e.isLive).slice(0, 2);
  return (
    <aside className="scrollbar-none sticky top-0 flex h-[100dvh] flex-col gap-4 overflow-y-auto py-4 pl-6 [&>*]:shrink-0" aria-label="Discover">
      <RailSearch />

      {live.length > 0 && (
        <section className="card overflow-hidden" aria-labelledby="rail-live">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h2 id="rail-live" className="flex items-center gap-2 font-display text-[19px] font-semibold">Live now</h2>
            <Link href="/live" className="text-[13px] font-semibold text-accent hover:underline">See all</Link>
          </div>
          <ul className="pb-2">
            {live.map((e) => (
              <li key={e.id}>
                <Link href={`/live/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                  {e.host && <Avatar url={e.host.avatarUrl} name={e.host.displayName} handle={e.host.handle} size={40} live />}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] leading-snug font-semibold">{e.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-3">
                      <LiveBadge className="!px-1 !text-[9px]" /> <span className="num">{e.viewers.toLocaleString("en-US")}</span> watching
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden" aria-labelledby="rail-trending">
        <h2 id="rail-trending" className="px-4 pt-3.5 pb-1 font-display text-[19px] font-semibold">Trending</h2>
        <ol>
          {trends.map((t, i) => (
            <li key={t.tag}>
              <Link href={`/search?q=${encodeURIComponent(`#${t.tag}`)}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                <span className="num w-5 font-display text-[22px] leading-none font-semibold text-ink-3">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">#{t.tag}</span>
                  <span className="flex items-center gap-1 text-[12.5px] text-ink-3">
                    {t.rising && <TrendIcon size={13} className="text-success" />}
                    <span className="num">{t.posts.toLocaleString("en-US")}</span> posts
                  </span>
                </span>
                <Sparkline values={t.series} width={64} height={24} color={t.rising ? "var(--success)" : "var(--accent)"} />
              </Link>
            </li>
          ))}
        </ol>
        <Link href="/explore" className="block px-4 py-3 text-[14px] font-semibold text-accent hover:bg-surface-2">Show more</Link>
      </section>

      {people.length > 0 && (
        <section className="card overflow-hidden" aria-labelledby="rail-wtf">
          <h2 id="rail-wtf" className="px-4 pt-3.5 pb-1 font-display text-[19px] font-semibold">Who to follow</h2>
          <ul className="pb-2">
            {people.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar url={u.avatarUrl} name={u.displayName} handle={u.handle} size={40} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[14px] font-semibold"><span className="truncate">{u.displayName}</span>{u.verified && <VerifiedSeal size={14} />}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">@{u.handle}</span>
                  </span>
                </Link>
                <FollowButton userId={u.id} following={u.viewerFollows} small />
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="px-2 pb-6 text-[12px] leading-relaxed text-ink-3">
        <nav className="flex flex-wrap gap-x-3 gap-y-1">
          <Link href="/legal/terms" className="hover:underline">Terms</Link>
          <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
          <Link href="/legal/guidelines" className="hover:underline">Community Guidelines</Link>
          <Link href="/design" className="hover:underline">Design system</Link>
        </nav>
        <p className="mt-1.5">© {new Date().getFullYear()} {COMPANY} · {APP_NAME} is a working name.</p>
      </footer>
    </aside>
  );
}
