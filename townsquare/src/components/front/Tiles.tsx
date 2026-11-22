import Link from "next/link";
import type { LiveEventView, NewsItemView, StorySummary } from "@/lib/news";
import type { PostView } from "@/lib/posts";
import { credibility, type Debate, type Voice } from "@/lib/takes";
import { FollowButton } from "../FollowButton";
import { PostCard } from "../PostCard";
import { Time } from "../Time";
import { Avatar } from "../ui/Avatar";
import { CategoryTag, Kicker, LiveBadge, SourceLabel, AiBadge, VerifiedSeal } from "../ui/Badge";
import { Sparkline } from "../ui/Sparkline";
import { MiniSplit, StanceMeter } from "../ui/Stance";
import { DebateCard } from "./DebateCard";
import { Poll } from "../post/Poll";
import { StoryArt } from "./StoryArt";
import { Meta, StatusTags, StoryTile } from "./StoryCard";
import { TeamChips } from "../sports/TeamChips";
export { StoryTile };
import { ArrowRightIcon, ClockIcon, DownloadIcon, EditionIcon, FlameIcon } from "../icons";

/** A glass panel with a bold label and an optional "more" link. */
export function Tile({ label, action, children, className = "", tone }: { label: string; action?: { href: string; text: string }; children: React.ReactNode; className?: string; tone?: "live" }) {
  return (
    <section aria-label={label} className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[19px] leading-none font-extrabold tracking-[0.04em] uppercase">
          <span aria-hidden="true" className={`h-4 w-1 rounded-full ${tone === "live" ? "bg-live shadow-[0_0_10px_var(--wn-red)]" : "bg-[var(--wn-blue-fill)] shadow-[0_0_10px_var(--wn-blue)]"}`} />
          {label}
        </h2>
        {action && <Link href={action.href} className="inline-flex min-h-9 items-center rounded-[8px] px-2 text-[12px] font-bold tracking-[0.06em] text-navy-ink uppercase hover:bg-white/5 hover:text-[var(--wn-cyan-ink)]">{action.text} →</Link>}
      </div>
      {children}
    </section>
  );
}

/** The hero lead story: full-width image, dark gradient overlay, headline on the image, a glow behind it. */
export function LeadTile({ s, latest }: { s: StorySummary; latest: string[] }) {
  return (
    <article className="hero-glow @container min-w-0">
      <Link href={`/news/story/${s.key}`} className="group relative block overflow-hidden rounded-[var(--r-xl)] ring-1 ring-[var(--wn-glass-border)] transition-shadow duration-300 hover:ring-[var(--wn-glass-border-hot)] hover:shadow-[var(--glow)]">
        <div className="relative aspect-square sm:aspect-[16/10] lg:aspect-[16/9]">
          <StoryArt seed={s.key} section={s.section} photo={s.photo} priority hero className="transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(7_11_20/0)_25%,rgb(7_11_20/0.55)_55%,rgb(7_11_20/0.96)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-7">
            <span className="flex flex-wrap items-center gap-2"><StatusTags s={s} /><TeamChips teams={s.teams} onImage names linked={false} /></span>
            <h2 className="mt-3 max-w-[22ch] font-display text-[clamp(2.05rem,0.95rem+4.6cqw,4.4rem)] leading-[0.95] font-extrabold tracking-[-0.01em] text-balance text-white uppercase [text-shadow:0_2px_24px_rgb(0_0_0/0.5)]">
              {s.title}
            </h2>
            <p className="mt-3 line-clamp-2 max-w-[62ch] text-[15px] text-[#d6dcea] sm:text-[16.5px]">{s.summary}</p>
            <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#c4cbe0]">
              <span className="flex items-center gap-1.5"><ClockIcon size={13} /> Updated <Time ms={s.updatedAt} /> ago</span>
              {s.source && <span className="font-semibold text-white">{s.source}</span>}
              <span className="mono">{s.takes} dispatches · {s.outlets} outlets</span>
            </span>
          </div>
        </div>
      </Link>
      <div className="card mt-3 grid gap-4 p-4 sm:p-5 xl:grid-cols-[1fr_320px]">
        {latest.length > 0 ? (
          <ul className="space-y-2.5">
            {latest.map((u, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-snug text-ink-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i === 0 ? "bg-[var(--wn-cyan)] shadow-[0_0_8px_var(--wn-cyan)]" : "bg-ink-3"}`} />
                <span><span className="mono mr-2 text-[11px] font-bold text-ink-3">{i === 0 ? "LATEST" : "EARLIER"}</span>{u}</span>
              </li>
            ))}
          </ul>
        ) : <span />}
        <div className="xl:border-l xl:border-rule xl:pl-5">
          <p className="folio mb-3 text-ink-3">What&apos;s the split?</p>
          <StanceMeter type="story" id={s.key} initial={s.split} variant="large" />
        </div>
      </div>
    </article>
  );
}

/** Trending: a sidebar list on desktop; a horizontal swipe row on phones (`row`). */
export function HotStories({ stories, row }: { stories: StorySummary[]; row?: boolean }) {
  if (row) {
    return (
      <section aria-label="Trending" className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-[19px] font-extrabold tracking-[0.04em] uppercase"><FlameIcon size={18} className="text-[var(--wn-cyan)]" /> Trending</h2>
          <Link href="/explore" className="inline-flex min-h-11 items-center px-2 text-[12px] font-bold tracking-[0.06em] text-navy-ink uppercase">All →</Link>
        </div>
        <ol className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1" data-no-swipe>
          {stories.map((s, i) => (
            <li key={s.key} className="w-[78%] max-w-[300px] shrink-0 snap-start">
              <Link href={`/news/story/${s.key}`} className="card card-hover flex h-full gap-3 overflow-hidden p-3">
                <span className="font-display text-[34px] leading-none font-extrabold text-[var(--wn-blue)] [text-shadow:0_0_18px_rgb(47_107_255/0.6)]">{i + 1}</span>
                <span className="min-w-0">
                  <span className="line-clamp-3 text-[14px] leading-snug font-semibold">{s.title}</span>
                  <span className="mono mt-1.5 block text-[10.5px] text-ink-3">+{s.velocity} dispatches / 6h</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return (
    <Tile label="Trending" action={{ href: "/explore", text: "All" }}>
      <ol className="divide-y divide-rule">
        {stories.map((s, i) => (
          <li key={s.key}>
            <Link href={`/news/story/${s.key}`} className="group grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[10px] py-3 transition-colors hover:bg-white/[0.03]">
              <span className="font-display text-[30px] leading-none font-extrabold text-[var(--wn-blue)] [text-shadow:0_0_18px_rgb(47_107_255/0.55)]">{i + 1}</span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[14.5px] leading-snug font-semibold group-hover:text-[var(--wn-cyan-ink)]">{s.title}</span>
                <span className="mt-1 flex items-center gap-3"><MiniSplit split={s.split} /><span className="mono text-[10.5px] text-ink-3">+{s.velocity} / 6h</span></span>
              </span>
              <Sparkline values={s.series} width={56} height={26} color="var(--wn-cyan)" label={`${s.takes} takes, trend`} />
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
            <Link href={`/live/${e.id}`} className="group flex items-center gap-3 rounded-[12px] bg-white/[0.03] p-2.5 ring-1 ring-[var(--wn-glass-border)] transition-all hover:ring-[var(--wn-red)]/60 hover:shadow-[0_0_20px_rgb(255_45_74/0.2)]">
              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[8px]"><StoryArt seed={e.title} section="Top Stories" /><span className="absolute top-1 left-1"><LiveBadge label="ON AIR" className="!px-1 !text-[8.5px]" /></span></span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[13.5px] leading-snug font-semibold group-hover:underline">{e.title}</span>
                <span className="mono text-[11px] text-ink-3">{e.viewers.toLocaleString("en-US")} watching</span>
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
    <Tile label="Quick Dispatches" action={{ href: "/explore", text: "More" }}>
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
                <span className="flex items-center gap-1 text-[15px] font-bold">{v.displayName}{v.verified && <VerifiedSeal size={14} />}{v.ai && <AiBadge />}</span>
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
              <span className="mt-1 block font-display text-[18px] leading-snug font-bold group-hover:text-[var(--wn-cyan-ink)]">{n.title}</span>
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
    <Link href="/briefing" className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[var(--r-xl)] bg-[var(--wn-blue-fill)] p-6 text-white shadow-[var(--glow-blue)] transition-transform duration-300 hover:-translate-y-0.5">
      <span aria-hidden="true" className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgb(34_211_238/0.55),transparent_65%)]" />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <span className="relative flex items-center gap-2 text-[12px] font-extrabold tracking-[0.14em] uppercase"><EditionIcon size={16} /> Morning Edition</span>
      <span className="relative mt-6 block font-display text-[clamp(1.9rem,1.5rem+1vw,2.4rem)] leading-[0.98] font-extrabold uppercase">{count} stories, 3 debates, one coffee.</span>
      <span className="relative mt-4 flex items-center justify-between text-[13px] text-white">
        <span className="mono">{minutes} min read · <DownloadIcon size={13} className="inline" /> offline</span>
        <ArrowRightIcon size={20} className="transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

/** Small headline list for the rest of the stories. */
export function MoreStories({ stories }: { stories: StorySummary[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((s) => (
        <li key={s.key}>
          <Link href={`/news/story/${s.key}`} className="card card-hover group flex h-full gap-3 overflow-hidden p-3">
            <span className="block aspect-square w-20 shrink-0 overflow-hidden rounded-[10px]"><StoryArt seed={s.key} section={s.section} photo={s.photo} width={320} /></span>
            <span className="min-w-0">
            <StatusTags s={s} />
            <span className="mt-1.5 block font-display text-[18px] leading-tight font-bold group-hover:text-[var(--wn-cyan-ink)]">{s.title}</span>
            <MiniSplit split={s.split} className="mt-2" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
