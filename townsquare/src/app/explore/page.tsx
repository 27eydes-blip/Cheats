import Link from "next/link";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { credibility, debates, voices } from "@/lib/takes";
import { FollowButton } from "@/components/FollowButton";
import { DebateCard } from "@/components/front/DebateCard";
import { Avatar } from "@/components/ui/Avatar";
import { Kicker, LiveBadge, VerifiedSeal } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Sparkline } from "@/components/ui/Sparkline";
import { MiniSplit } from "@/components/ui/Stance";
import { CHANNELS } from "@/components/shell/channels";
import { DiscoverSearch } from "./DiscoverSearch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover" };

/** Hot Stories: ranked by take velocity, plus Voices and the hottest debates. */
export default async function HotStoriesPage() {
  const viewer = await getViewer();
  const vid = viewer?.id ?? null;
  const hot = listStories(12, { order: "hot", viewerId: vid });
  const people = voices(vid, 6);
  const fights = debates(vid, 2);
  return (
    <Frame width="wide">
      <PageTitle folio={<Kicker tone="gold">What&apos;s moving now</Kicker>} title="Discover" dek="Search, browse channels, and see where the argument is happening right now." />
      <div className="space-y-3 px-4 pt-4 sm:px-6">
        <DiscoverSearch />
        <nav aria-label="Channels" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" data-no-swipe>
          {CHANNELS.filter((c) => c.key !== "front").map((c) => (
            <Link key={c.key} href={c.href} className="inline-flex min-h-11 shrink-0 items-center rounded-[12px] px-3.5 text-[13px] font-bold tracking-[0.04em] text-ink-2 uppercase ring-1 ring-rule transition-all hover:text-[var(--wn-cyan-ink)] hover:ring-[var(--wn-glass-border-hot)] active:scale-95">{c.label}</Link>
          ))}
          <Link href="/sports" className="inline-flex min-h-11 shrink-0 items-center rounded-[12px] px-3.5 text-[13px] font-bold tracking-[0.04em] text-ink-2 uppercase ring-1 ring-rule transition-all hover:text-[var(--wn-cyan-ink)] active:scale-95">Teams</Link>
        </nav>
        <h2 className="pt-2 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">Hot stories</h2>
      </div>
      <div className="grid gap-10 px-4 pt-1 sm:px-6 lg:grid-cols-12">
        <ol className="lg:col-span-8">
          {hot.map((s, i) => (
            <li key={s.key} className="border-b border-rule">
              <Link href={`/news/story/${s.key}`} className="group grid grid-cols-[44px_1fr] gap-4 py-5 sm:grid-cols-[64px_1fr_auto]">
                <span className="font-display text-[44px] leading-none font-semibold text-gold-ink sm:text-[56px]">{i + 1}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">{s.status === "live" && <LiveBadge label="LIVE" />}<Kicker tone="muted">{s.section === "Top Stories" ? "National" : s.section}</Kicker></span>
                  <span className="mt-1 block font-display text-[clamp(1.3rem,1.1rem+0.8vw,1.75rem)] leading-snug font-semibold group-hover:underline">{s.title}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-4"><MiniSplit split={s.split} /><span className="mono text-[11.5px] text-ink-3">{s.takes} DISPATCHES · +{s.velocity} IN 6H</span></span>
                </span>
                <span className="col-start-2 sm:col-start-3"><Sparkline values={s.series} width={120} height={40} color="var(--gold)" label={`Take trend for ${s.title}`} /></span>
              </Link>
            </li>
          ))}
        </ol>
        <aside className="space-y-10 lg:col-span-4">
          <section aria-labelledby="voices" className="border-t border-[var(--wn-glass-border)] pt-3">
            <h2 id="voices" className="folio text-navy-ink">Voices</h2>
            <ul className="divide-y divide-rule">
              {people.map((v) => (
                <li key={v.id} className="flex items-start gap-3 py-3">
                  <Link href={`/u/${v.handle}`} className="flex min-w-0 flex-1 gap-3">
                    <Avatar url={v.avatarUrl} name={v.displayName} handle={v.handle} size={42} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 font-display text-[17px] font-semibold">{v.displayName}{v.verified && <VerifiedSeal size={14} />}</span>
                      <span className="line-clamp-1 block text-[13px] text-ink-2">{v.bio}</span>
                      <span className="mono block text-[10.5px] text-gold-ink">{credibility(v)}</span>
                    </span>
                  </Link>
                  <FollowButton userId={v.id} following={v.viewerFollows} small />
                </li>
              ))}
            </ul>
          </section>
          {fights.map((d) => (
            <section key={d.left.id} aria-label="Debate" className="border-t border-[var(--wn-glass-border)] pt-3">
              <h2 className="folio mb-3 text-navy-ink">Hot debate</h2>
              <DebateCard d={d} compact />
            </section>
          ))}
        </aside>
      </div>
    </Frame>
  );
}
