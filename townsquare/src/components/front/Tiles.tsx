import Link from "next/link";
import type { LiveEventView, NewsItemView, StorySummary } from "@/lib/news";
import type { PostView } from "@/lib/posts";
import { credibility, type Debate, type Voice } from "@/lib/takes";
import { FollowButton } from "../FollowButton";
import { PostCard } from "../PostCard";
import { Time } from "../Time";
import { Avatar } from "../ui/Avatar";
import { Kicker, LiveBadge, SourceLabel, VerifiedSeal } from "../ui/Badge";
import { Sparkline } from "../ui/Sparkline";
import { MiniSplit, StanceMeter } from "../ui/Stance";
import { DebateCard } from "./DebateCard";
import { Poll } from "../post/Poll";
import { StoryArt } from "./StoryArt";
import { ArrowRightIcon, DownloadIcon, EditionIcon } from "../icons";

/** A tile: a folio label over a 2px navy rule, newspaper style. */
export function Tile({ label, action, children, className = "", tone }: { label: string; action?: { href: string; text: string }; children: React.ReactNode; className?: string; tone?: "live" }) {
  return (
    <section aria-label={label} className={`min-w-0 border-t-2 pt-3 ${tone === "live" ? "border-live-bg" : "border-navy-ink"} ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={`folio flex items-center gap-2 ${tone === "live" ? "text-live-bg dark:text-live" : "text-navy-ink"}`}>
          {tone === "live" && <span className="h-1.5 w-1.5 animate-live rounded-full bg-live" />}
          {label}
        </h2>
        {action && <Link href={action.href} className="folio !text-[10px] text-ink-3 hover:text-navy-ink">{action.text} →</Link>}
      </div>
      {children}
    </section>
  );
}

function StatusKicker({ s }: { s: StorySummary }) {
  return (
    <span className="flex items-center gap-2">
      {s.status === "live" ? <LiveBadge label="LIVE" /> : s.status === "developing" ? <Kicker tone="gold">Developing</Kicker> : <Kicker tone="muted">Final</Kicker>}
      <Kicker tone="muted">{s.section === "Top Stories" ? "National" : s.section}</Kicker>
    </span>
  );
}

/** The Lead Story: the biggest tile on the page. */
export function LeadTile({ s, latest }: { s: StorySummary; latest: string[] }) {
  return (
    <article className="min-w-0 border-t-[3px] border-navy-ink pt-3">
      <Link href={`/news/story/${s.key}`} className="group block">
        <div className="relative aspect-[16/7] overflow-hidden">
          <StoryArt seed={s.key} section={s.section} className="transition-transform duration-700 group-hover:scale-[1.02]" />
          <span className="mono absolute right-3 bottom-3 bg-navy/85 px-2 py-1 text-[11px] text-white">{s.takes} takes · {s.outlets} outlets</span>
        </div>
        <div className="mt-4"><StatusKicker s={s} /></div>
        <h2 className="mt-2 font-display text-[clamp(2.2rem,1.4rem+2.6vw,3.6rem)] leading-[1.02] font-semibold text-balance group-hover:underline decoration-gold decoration-2 underline-offset-[6px]">{s.title}</h2>
      </Link>
      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_300px]">
        <div>
          <p className="drop-cap text-[17px] leading-relaxed text-ink-2">{s.summary}</p>
          {latest.length > 0 && (
            <ul className="mt-4 space-y-2 border-l-2 border-gold pl-4">
              {latest.map((u, i) => <li key={i} className="text-[14.5px] leading-snug"><span className="mono mr-2 text-[11px] text-ink-3">{i === 0 ? "LATEST" : "EARLIER"}</span>{u}</li>)}
            </ul>
          )}
        </div>
        <div className="border-t border-rule pt-3 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
          <p className="folio mb-3 text-ink-3">What&apos;s the split?</p>
          <StanceMeter type="story" id={s.key} initial={s.split} variant="large" />
        </div>
      </div>
    </article>
  );
}

/** Medium story tile. */
export function StoryTile({ s, big }: { s: StorySummary; big?: boolean }) {
  return (
    <article className="min-w-0 border-t-2 border-navy-ink pt-3">
      <Link href={`/news/story/${s.key}`} className="group block">
        <div className={`overflow-hidden ${big ? "aspect-[16/9]" : "aspect-[3/2]"}`}><StoryArt seed={s.key} section={s.section} className="transition-transform duration-700 group-hover:scale-[1.03]" /></div>
        <div className="mt-3"><StatusKicker s={s} /></div>
        <h3 className={`mt-1.5 font-display font-semibold text-balance group-hover:underline decoration-gold decoration-2 underline-offset-4 ${big ? "text-h1" : "text-h2"}`}>{s.title}</h3>
        {big && <p className="mt-2 line-clamp-2 text-[15px] text-ink-2">{s.summary}</p>}
      </Link>
      <div className="mt-3 flex items-center justify-between gap-3">
        <MiniSplit split={s.split} />
        <span className="mono text-[11.5px] text-ink-3">{s.takes} takes</span>
      </div>
    </article>
  );
}

/** Hot Stories: ranked by take velocity, with sparkline and split. */
export function HotStories({ stories }: { stories: StorySummary[] }) {
  return (
    <Tile label="Hot Stories" action={{ href: "/explore", text: "All" }}>
      <ol className="divide-y divide-rule">
        {stories.map((s, i) => (
          <li key={s.key}>
            <Link href={`/news/story/${s.key}`} className="group grid grid-cols-[28px_1fr_auto] items-center gap-3 py-2.5">
              <span className="font-display text-[26px] leading-none font-semibold text-gold-ink">{i + 1}</span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[14.5px] leading-snug font-semibold group-hover:underline">{s.title}</span>
                <span className="mt-1 flex items-center gap-3"><MiniSplit split={s.split} /><span className="mono text-[10.5px] text-ink-3">+{s.velocity} / 6h</span></span>
              </span>
              <Sparkline values={s.series} width={56} height={26} color="var(--gold)" label={`${s.takes} takes, trend`} />
            </Link>
          </li>
        ))}
      </ol>
    </Tile>
  );
}

/** Live Now: studio monitors with an ON AIR light. */
export function LiveNowTile({ events }: { events: LiveEventView[] }) {
  const on = events.filter((e) => e.isLive);
  const next = events.find((e) => !e.isLive);
  return (
    <Tile label="Live Studio" tone="live" action={{ href: "/live", text: "Schedule" }}>
      <ul className="space-y-2.5">
        {on.map((e) => (
          <li key={e.id}>
            <Link href={`/live/${e.id}`} className="group flex items-center gap-3 bg-navy p-2.5 text-white">
              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[2px]"><StoryArt seed={e.id} section="Top Stories" /><span className="absolute top-1 left-1"><LiveBadge label="ON AIR" className="!px-1 !text-[8.5px]" /></span></span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[13.5px] leading-snug font-semibold group-hover:underline">{e.title}</span>
                <span className="mono text-[11px] text-white/70">{e.viewers.toLocaleString("en-US")} watching</span>
              </span>
            </Link>
          </li>
        ))}
        {next && <li className="text-[13px] text-ink-2"><span className="folio mr-2 !text-[10px] text-ink-3">Next</span><Link href="/live" className="font-semibold hover:underline">{next.title}</Link></li>}
      </ul>
    </Tile>
  );
}

export function QuickTakes({ takes }: { takes: PostView[] }) {
  return (
    <Tile label="Quick Takes" action={{ href: "/explore", text: "More" }}>
      <ul className="divide-y divide-rule">{takes.map((p) => <li key={p.id}><PostCard post={p} compact /></li>)}</ul>
    </Tile>
  );
}

export function VoicesTile({ voices }: { voices: Voice[] }) {
  return (
    <Tile label="Voices" action={{ href: "/explore", text: "More" }}>
      <ul className="divide-y divide-rule">
        {voices.map((v) => (
          <li key={v.id} className="flex items-start gap-3 py-3">
            <Link href={`/u/${v.handle}`} className="flex min-w-0 flex-1 gap-3">
              <Avatar url={v.avatarUrl} name={v.displayName} handle={v.handle} size={42} />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-display text-[17px] font-semibold">{v.displayName}{v.verified && <VerifiedSeal size={14} />}</span>
                <span className="line-clamp-1 block text-[13px] text-ink-2">{v.bio}</span>
                <span className="mono mt-0.5 block text-[10.5px] text-gold-ink">{credibility(v)}</span>
              </span>
            </Link>
            <FollowButton userId={v.id} following={v.viewerFollows} small />
          </li>
        ))}
      </ul>
    </Tile>
  );
}

export function WireTile({ items }: { items: NewsItemView[] }) {
  return (
    <Tile label="From the outlets" action={{ href: "/news", text: "News hub" }}>
      <ul className="divide-y divide-rule">
        {items.map((n) => (
          <li key={n.id}>
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="group block py-2.5">
              <span className="flex items-center gap-2"><SourceLabel name={n.source} /><span className="mono text-[10.5px] text-ink-3"><Time ms={n.publishedAt} /></span></span>
              <span className="mt-1 block font-display text-[16.5px] leading-snug font-semibold group-hover:underline">{n.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

export function DebateTile({ debate }: { debate: Debate }) {
  return (
    <Tile label="Hot Debate" action={debate.story ? { href: `/news/story/${debate.story.key}`, text: "Story" } : undefined}>
      <DebateCard d={debate} />
    </Tile>
  );
}

export function PollTile({ post }: { post: PostView }) {
  return (
    <Tile label="Poll of the Day">
      <PostCard post={post} compact />
      {post.poll && <div className="-mt-1"><PollOnly post={post} /></div>}
    </Tile>
  );
}

function PollOnly({ post }: { post: PostView }) {
  return <Poll poll={post.poll!} postId={post.id} isAuthor={post.viewer.isAuthor} createdAt={post.createdAt} />;
}

export function BriefingPromo({ minutes, count }: { minutes: number; count: number }) {
  return (
    <Link href="/briefing" className="group flex min-h-[200px] flex-col justify-between bg-navy p-5 text-white">
      <span className="folio flex items-center gap-2 text-gold"><EditionIcon size={16} /> Morning Edition</span>
      <span className="mt-6 block font-display text-[26px] leading-tight font-semibold">{count} stories, 3 debates, one coffee.</span>
      <span className="mt-4 flex items-center justify-between text-[13px] text-white/75">
        <span className="mono">{minutes} min read · <DownloadIcon size={13} className="inline" /> offline</span>
        <ArrowRightIcon size={18} className="text-gold transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

/** Small headline list for the rest of the stories. */
export function MoreStories({ stories }: { stories: StorySummary[] }) {
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
      {stories.map((s) => (
        <li key={s.key} className="border-t border-rule py-3">
          <Link href={`/news/story/${s.key}`} className="group block">
            <StatusKicker s={s} />
            <span className="mt-1 block font-display text-[18px] leading-snug font-semibold group-hover:underline">{s.title}</span>
            <MiniSplit split={s.split} className="mt-2" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
