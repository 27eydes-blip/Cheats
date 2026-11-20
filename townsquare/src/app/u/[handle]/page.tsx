import { APP_SHORT } from "@/config";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { profileFeed } from "@/lib/feed";
import { getPostView, liveHostIds } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { bylineStats, debates } from "@/lib/takes";
import { getProfile } from "@/lib/users";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { DebateCard } from "@/components/front/DebateCard";
import { LinkIcon } from "@/components/icons";
import { Tabs } from "@/components/PageHeader";
import { RichText } from "@/components/RichText";
import { Avatar } from "@/components/ui/Avatar";
import { Kicker, LiveBadge, VerifiedSeal } from "@/components/ui/Badge";
import { Frame } from "@/components/ui/Frame";
import { StanceChip } from "@/components/ui/Stance";
import { EmptyState } from "@/components/ui/States";
import { ProfileMenu } from "./ProfileMenu";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = getProfile((await params).handle, null);
  return { title: p ? `${p.displayName}, byline` : "Byline not found" };
}

function age(ms: number) {
  const y = (Date.now() - ms) / (365 * 86_400_000);
  return y >= 1 ? `${y.toFixed(1)} yrs` : `${Math.max(1, Math.round(y * 12))} mo`;
}

/** The byline page: who someone is, how credible their record is, and what they've argued. */
export default async function Byline({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ handle }, sp, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const p = getProfile(handle, viewer?.id ?? null);
  if (!p) notFound();
  if (p.viewer.blockedBy) return <EmptyState art="community" title={`You can't view @${p.handle}`} body="This account has limited who can see it." />;
  const tab = sp.tab === "debates" ? "debates" : sp.tab === "rundown" ? "rundown" : "takes";
  const live = liveHostIds().has(p.id);
  const stats = bylineStats(p.id);
  const pinned = p.pinnedPostId && !p.viewer.blocked ? getPostView(p.pinnedPostId, viewer?.id ?? null) : null;
  const feed = p.viewer.blocked ? { items: [], nextCursor: null } : profileFeed(p.id, "posts", viewer?.id ?? null, null, 40);
  const takes = { ...feed, items: feed.items.filter((i) => !i.repostedBy && i.post.id !== pinned?.id), nextCursor: null };
  const amplified = { ...feed, items: feed.items.filter((i) => i.repostedBy), nextCursor: null };
  const fights = tab === "debates" ? debates(viewer?.id ?? null, 6, undefined, p.id) : [];

  const cred: [string, string][] = [
    ["Status", p.verified ? "Verified" : "Member"],
    [`On ${APP_SHORT}`, age(p.joinedAt)],
    ["Context notes", String(stats.ctx)],
    ["Takes", String(stats.takes)],
    ...(p.followers !== null ? ([["Followers", p.followers.toLocaleString("en-US")]] as [string, string][]) : []),
  ];

  return (
    <Frame width="medium">
      <header className="px-4 pt-8 sm:px-6 lg:pt-12">
        <div className="flex items-center justify-between">
          <Kicker tone={p.verified ? "gold" : "muted"}>{p.verified ? "Verified Voice" : "Byline"}</Kicker>
          {viewer && !p.viewer.isSelf && <ProfileMenu userId={p.id} handle={p.handle} blocked={p.viewer.blocked} muted={p.viewer.muted} />}
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-end">
          <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={112} live={live} />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 font-display text-mega font-semibold">
              {p.displayName}
              {p.verified && <VerifiedSeal size={32} />}
            </h1>
            <p className="mono mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-ink-3">
              @{p.handle}
              {p.viewer.followsYou && <span className="rounded-[6px] bg-paper-2 px-1.5 py-0.5 text-ink-2">FOLLOWS YOU</span>}
              {live && <Link href="/live"><LiveBadge /></Link>}
            </p>
          </div>
        </div>
        {p.bio && <p className="mt-5 max-w-[680px] text-[clamp(1.05rem,1rem+0.3vw,1.2rem)] leading-snug font-medium text-ink-2">{p.bio}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {p.viewer.isSelf ? <Link href="/settings/profile" className="btn-outline">Edit byline</Link> : viewer ? (!p.viewer.blocked && <FollowButton userId={p.id} following={p.viewer.follows} />) : <Link href="/login" className="btn-primary">Follow</Link>}
          {p.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow me" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-navy-ink hover:underline">
              <LinkIcon size={15} /> {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          ))}
        </div>
        {/* Credibility record */}
        <dl className="mt-6 grid grid-cols-2 border-y-2 border-navy-ink sm:grid-cols-5">
          {cred.map(([k, v], i) => (
            <div key={k} className={`px-3 py-3 ${i ? "border-l border-rule" : ""} max-sm:[&:nth-child(odd)]:border-l-0 max-sm:border-b max-sm:border-rule`}>
              <dt className="folio !text-[9.5px] text-ink-3">{k}</dt>
              <dd className={`mono mt-1 text-[19px] font-semibold ${k === "Status" && p.verified ? "text-gold-ink" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {p.followers !== null && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            <Link href={`/u/${p.handle}/following`} className="hover:underline">Following {p.following}</Link> · <Link href={`/u/${p.handle}/followers`} className="hover:underline">Followers {p.followers}</Link> · Joined {new Date(p.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        )}
        {p.status === "suspended" && <p className="mt-3 border-l-2 border-disagree bg-danger-soft px-3 py-2 text-[14px] text-disagree">This account is suspended.</p>}
      </header>

      {pinned && !pinned.gone && (
        <figure className="mx-4 mt-10 border-y border-rule py-6 sm:mx-6">
          <p className="folio mb-3 flex items-center gap-2 text-gold-ink">Pinned take {pinned.stance && <StanceChip stance={pinned.stance} />}</p>
          <blockquote className="border-l-[3px] border-gold pl-5 font-display text-[clamp(1.4rem,1.15rem+1vw,2rem)] leading-snug font-medium">
            “<RichText text={pinned.body.replace(/\s*#\w+\s*$/, "")} />”
          </blockquote>
          {pinned.story && <figcaption className="mt-3 pl-5 text-[13px] text-ink-3">On <Link href={`/news/story/${pinned.story.key}`} className="font-semibold text-gold-ink hover:underline">{pinned.story.title}</Link></figcaption>}
        </figure>
      )}

      <div className="sticky-sub z-20 mt-8 border-b border-rule bg-paper">
        <Tabs
          active={tab}
          tabs={[
            { key: "takes", label: "Takes", href: `/u/${p.handle}` },
            { key: "debates", label: "Debates", href: `/u/${p.handle}?tab=debates` },
            { key: "rundown", label: "Rundown", href: `/u/${p.handle}?tab=rundown` },
          ]}
        />
      </div>
      {p.viewer.blocked ? (
        <EmptyState art="community" title={`You blocked @${p.handle}`} body="Unblock from the ••• menu to see their takes." />
      ) : tab === "debates" ? (
        fights.length ? <div className="grid gap-6 px-4 py-6 sm:px-6">{fights.map((d) => <DebateCard key={d.left.id} d={d} />)}</div> : <EmptyState art="community" title="No debates yet" body="When someone answers a take with the opposite stance, the exchange lands here." />
      ) : tab === "rundown" ? (
        <Feed key="rundown" initial={amplified} source={{ tab: "profile", handle: p.handle, ptab: "posts" }} empty={<EmptyState art="feed" title="Nothing amplified yet" body="Takes this person amplifies appear in their public Rundown." />} />
      ) : (
        <Feed key="takes" initial={takes} source={{ tab: "profile", handle: p.handle, ptab: "posts" }} prependOwn={p.viewer.isSelf} empty={<EmptyState art="feed" title="No takes yet" body="Their takes on the news will show up here." />} />
      )}
    </Frame>
  );
}
