import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { profileFeed, type ProfileTab } from "@/lib/feed";
import { getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { getProfile } from "@/lib/users";
import { liveHostIds } from "@/lib/posts";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { BackIcon, CalendarIcon, LinkIcon, PinIcon } from "@/components/icons";
import { Tabs } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { ProfileBanner } from "@/components/ProfileBanner";
import { Avatar } from "@/components/ui/Avatar";
import { LiveBadge, VerifiedSeal } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { ProfileMenu } from "./ProfileMenu";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const p = getProfile(handle, null);
  return { title: p ? `${p.displayName} (@${p.handle})` : "Profile not found" };
}

const EMPTY: Record<ProfileTab, string> = { posts: "No posts yet", replies: "No replies yet", media: "No photos yet", likes: "No likes yet" };

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ handle }, sp, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const p = getProfile(handle, viewer?.id ?? null);
  if (!p) notFound();
  const tab = (["posts", "replies", "media", "likes"].includes(sp.tab ?? "") ? sp.tab : "posts") as ProfileTab;
  const live = liveHostIds().has(p.id);

  if (p.viewer.blockedBy) {
    return <EmptyState art="community" title={`You can't view @${p.handle}`} body="This account has limited who can see it." />;
  }

  const pinned = tab === "posts" && p.pinnedPostId && !p.viewer.blocked ? getPostView(p.pinnedPostId, viewer?.id ?? null) : null;
  const feed = p.viewer.blocked ? { items: [], nextCursor: null } : profileFeed(p.id, tab, viewer?.id ?? null);
  if (pinned) feed.items = feed.items.filter((i) => i.post.id !== pinned.id || i.repostedBy);

  const stats = [
    { label: "Posts", value: p.postCount, href: `/u/${p.handle}` },
    ...(p.following !== null ? [{ label: "Following", value: p.following, href: `/u/${p.handle}/following` }, { label: "Followers", value: p.followers!, href: `/u/${p.handle}/followers` }] : []),
  ];

  return (
    <>
      <div className="relative">
        <ProfileBanner url={p.bannerUrl} handle={p.handle} />
        <Link href="/" className="absolute top-3 left-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 sm:hidden" aria-label="Back"><BackIcon size={20} /></Link>
      </div>
      <div className="relative px-4 sm:px-6">
        <div className="flex items-end justify-between gap-3">
          <div className="-mt-12 sm:-mt-16">
            <span className="sm:hidden"><Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={96} live={live} /></span>
            <span className="hidden sm:block"><Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={128} live={live} /></span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {p.viewer.isSelf ? (
              <Link href="/settings/profile" className="btn-outline !min-h-10">Edit profile</Link>
            ) : viewer ? (
              <>
                <ProfileMenu userId={p.id} handle={p.handle} blocked={p.viewer.blocked} muted={p.viewer.muted} />
                {!p.viewer.blocked && <FollowButton userId={p.id} following={p.viewer.follows} />}
              </>
            ) : (
              <Link href="/login" className="btn-ink">Follow</Link>
            )}
          </div>
        </div>
        <div className="mt-3">
          <h1 className="flex items-center gap-2 font-display text-h1 font-semibold">
            {p.displayName} {p.verified && <VerifiedSeal size={24} />}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink-3">
            @{p.handle}
            {p.viewer.followsYou && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold text-ink-2">Follows you</span>}
            {live && <Link href="/live"><LiveBadge label="LIVE NOW" /></Link>}
          </p>
        </div>
        {p.status === "suspended" && <p className="mt-3 rounded-[var(--r-md)] bg-danger-soft px-3 py-2 text-[14px] text-danger">This account is suspended.</p>}
        {p.bio && <p className="mt-3 max-w-prose text-[16px] leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-ink-3">
          {p.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow me" className="flex items-center gap-1 font-medium text-accent hover:underline">
              <LinkIcon size={15} /> {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          ))}
          <span className="flex items-center gap-1"><CalendarIcon size={15} /> Joined {new Date(p.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        </div>
        <dl className="mt-5 mb-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="rounded-[var(--r-md)] bg-surface-2/70 px-3 py-2.5 transition-colors hover:bg-surface-2">
              <dd className="num font-display text-[22px] leading-none font-semibold">{s.value.toLocaleString("en-US")}</dd>
              <dt className="mt-1 text-[12.5px] font-medium text-ink-3">{s.label}</dt>
            </Link>
          ))}
          {p.following === null && <p className="col-span-2 self-center text-[13px] text-ink-3">Follower lists are private</p>}
        </dl>
      </div>
      <div className="sticky-sub glass z-20 border-y border-line">
        <Tabs
          active={tab}
          tabs={[
            { key: "posts", label: "Posts", href: `/u/${p.handle}` },
            { key: "replies", label: "Replies", href: `/u/${p.handle}?tab=replies` },
            { key: "media", label: "Media", href: `/u/${p.handle}?tab=media` },
            ...(p.viewer.isSelf ? [{ key: "likes", label: "Likes", href: `/u/${p.handle}?tab=likes` }] : []),
          ]}
        />
      </div>
      {p.viewer.blocked ? (
        <EmptyState art="community" title={`You blocked @${p.handle}`} body="Unblock from the ••• menu to see their posts." />
      ) : (
        <>
          {pinned && !pinned.gone && (
            <div className="border-b border-line bg-accent-soft/40">
              <p className="flex items-center gap-1.5 px-4 pt-3 pl-[62px] text-[12.5px] font-bold tracking-wide text-ink-3 uppercase sm:pl-[66px]"><PinIcon size={13} /> Pinned</p>
              <PostCard post={pinned} />
            </div>
          )}
          <Feed key={tab} initial={feed} source={{ tab: "profile", handle: p.handle, ptab: tab }} prependOwn={p.viewer.isSelf && tab === "posts"} empty={<EmptyState art={tab === "media" ? "feed" : "feed"} title={EMPTY[tab]} />} />
        </>
      )}
    </>
  );
}
