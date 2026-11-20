import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { searchPosts } from "@/lib/feed";
import { getStory } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { LinkArt } from "@/components/post/LinkCard";
import { BackIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { LiveBadge, SourceLabel, VerifiedSeal } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { LocalDate, Time } from "@/components/Time";
import { StoryActions } from "./StoryActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const s = getStory((await params).key);
  return { title: s?.title ?? "Story", description: s?.summary };
}

export default async function StoryPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const story = getStory(key);
  if (!story) notFound();
  const viewer = await getViewer();
  const thread = story.tag ? searchPosts(`#${story.tag}`, viewer?.id ?? null) : null;
  const keyMoments = story.updates.filter((u) => u.kind === "key");

  return (
    <article>
      {/* Hero */}
      <header className="relative overflow-hidden bg-[var(--ticker-bg)] text-white">
        <div className="absolute inset-0 opacity-70"><LinkArt seed={story.key + story.section} /></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
        <div className="relative px-4 pt-4 pb-6 sm:px-6 sm:pb-8">
          <Link href="/news" className="inline-flex h-10 items-center gap-1 rounded-full bg-white/10 pr-3.5 pl-2 text-[13.5px] font-semibold backdrop-blur hover:bg-white/20">
            <BackIcon size={18} /> News
          </Link>
          <div className="mt-10 flex flex-wrap items-center gap-2 sm:mt-16">
            {story.status === "live" ? <LiveBadge label="LIVE UPDATES" /> : <span className="kicker rounded-md bg-white/15 px-2 py-1">{story.status === "developing" ? "Developing" : "Ended"}</span>}
            <span className="kicker text-white/75">{story.section}</span>
          </div>
          <h1 className="mt-3 font-display text-[clamp(2rem,1.3rem+3vw,3.25rem)] leading-[1.03] font-semibold text-balance">{story.title}</h1>
          <p className="mt-3 max-w-xl text-[16.5px] leading-relaxed text-white/85">{story.summary}</p>
          <p className="num mt-4 text-[13px] text-white/70">
            Updated <Time ms={story.updatedAt} /> ago · {story.updates.length} updates · {story.outlets} outlets
          </p>
          <StoryActions tag={story.tag} title={story.title} />
        </div>
      </header>

      {keyMoments.length > 0 && (
        <section aria-labelledby="key" className="border-b border-line px-4 py-5 sm:px-6">
          <h2 id="key" className="kicker text-accent">Key moments</h2>
          <ol className="mt-2 space-y-2">
            {keyMoments.map((k) => (
              <li key={k.id} className="flex gap-2.5 text-[15.5px] leading-snug font-medium"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{k.body}</li>
            ))}
          </ol>
        </section>
      )}

      {/* Timeline */}
      <section aria-labelledby="timeline" className="px-4 pt-6 sm:px-6">
        <h2 id="timeline" className="font-display text-h2 font-semibold">Timeline</h2>
        <ol className="relative mt-4 border-l-2 border-line pl-6">
          {story.updates.map((u, i) => (
            <li key={u.id} className="relative pb-7 last:pb-2">
              <span
                aria-hidden="true"
                className={`absolute top-1 -left-[33px] h-4 w-4 rounded-full ring-4 ring-surface ${i === 0 && story.status === "live" ? "animate-live bg-live" : u.kind === "key" ? "bg-accent" : "bg-line-strong"}`}
              />
              <p className="num text-[12.5px] font-semibold text-ink-3">
                {i === 0 && story.status === "live" && <span className="mr-1.5 text-live">LATEST ·</span>}
                <LocalDate ms={u.createdAt} options={{ hour: "numeric", minute: "2-digit" }} />
              </p>
              {u.kind === "quote" ? (
                <blockquote className="mt-1.5 border-l-[3px] border-accent pl-4 font-display text-[21px] leading-snug italic">{u.body}</blockquote>
              ) : (
                <p className={`mt-1 leading-relaxed ${u.kind === "key" ? "text-[17px] font-semibold" : "text-[16px] text-ink-2"}`}>{u.body}</p>
              )}
              <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-3">
                {u.author ? (
                  <Link href={`/u/${u.author.handle}`} className="flex items-center gap-1.5 hover:underline">
                    <Avatar url={u.author.avatarUrl} name={u.author.displayName} handle={u.author.handle} size={22} ring={false} />
                    <span className="font-semibold text-ink-2">{u.author.displayName}</span>
                    {u.author.verified && <VerifiedSeal size={13} />}
                  </Link>
                ) : u.source ? (
                  <SourceLabel name={u.source} />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* How it is covered */}
      {story.coverage.length > 0 && (
        <section aria-labelledby="coverage" className="mt-4 border-t border-line py-6">
          <div className="flex items-end justify-between px-4 sm:px-6">
            <div>
              <h2 id="coverage" className="font-display text-h2 font-semibold">How it is covered</h2>
              <p className="text-[14px] text-ink-3">{story.coverage.length} reports from {new Set(story.coverage.map((c) => c.source)).size} outlets, side by side</p>
            </div>
          </div>
          <ul className="scrollbar-none mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:px-6" data-no-swipe>
            {story.coverage.map((c) => (
              <li key={c.id} className="w-[76%] shrink-0 snap-start sm:w-[44%]">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="card flex h-full flex-col p-4 transition-shadow hover:shadow-2">
                  <SourceLabel name={c.source} size="md" />
                  <h3 className="mt-3 flex-1 font-display text-[18px] leading-snug font-semibold">{c.title}</h3>
                  <p className="mt-3 text-[12.5px] text-ink-3"><Time ms={c.publishedAt} /> ago · Read at {c.source} ↗</p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Community thread */}
      <section aria-labelledby="discussion" className="border-t border-line pt-6">
        <div className="px-4 sm:px-6">
          <h2 id="discussion" className="font-display text-h2 font-semibold">The conversation</h2>
          <p className="text-[14px] text-ink-3">{story.tag ? <>Posts tagged <Link href={`/search?q=${encodeURIComponent(`#${story.tag}`)}`} className="font-semibold text-accent">#{story.tag}</Link></> : "Community posts about this story"}</p>
        </div>
        {thread ? (
          <Feed initial={thread} source={{ tab: "search", q: `#${story.tag}` }} empty={<EmptyState art="community" title="Start the conversation" body="Be the first to post about this story." />} />
        ) : (
          <EmptyState art="community" title="No discussion yet" />
        )}
      </section>
    </article>
  );
}
