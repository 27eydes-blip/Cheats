import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { profileFeed, type ProfileTab } from "@/lib/feed";
import { getPostView } from "@/lib/posts";
import { getViewer } from "@/lib/session";
import { getProfile } from "@/lib/users";
import { Avatar } from "@/components/Avatar";
import { Feed } from "@/components/Feed";
import { FollowButton } from "@/components/FollowButton";
import { CalendarIcon, LinkIcon, PinIcon, VerifiedBadge } from "@/components/icons";
import { PageHeader, Tabs } from "@/components/PageHeader";
import { PostCard } from "@/components/PostCard";
import { ProfileMenu } from "./ProfileMenu";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const p = getProfile(handle, null);
  return { title: p ? `${p.displayName} (@${p.handle})` : "Profile not found" };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ handle }, sp, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const p = getProfile(handle, viewer?.id ?? null);
  if (!p) notFound();
  const tab = (["posts", "replies", "media", "likes"].includes(sp.tab ?? "") ? sp.tab : "posts") as ProfileTab;

  if (p.viewer.blockedBy) {
    return (
      <>
        <PageHeader title={`@${p.handle}`} back />
        <p className="px-6 py-16 text-center text-muted">You can&apos;t view this account.</p>
      </>
    );
  }

  const pinned = tab === "posts" && p.pinnedPostId && !p.viewer.blocked ? getPostView(p.pinnedPostId, viewer?.id ?? null) : null;
  const feed = p.viewer.blocked ? { items: [], nextCursor: null } : profileFeed(p.id, tab, viewer?.id ?? null);
  if (pinned) feed.items = feed.items.filter((i) => i.post.id !== pinned.id || i.repostedBy);

  return (
    <>
      <PageHeader title={p.displayName} subtitle={`${p.postCount.toLocaleString()} posts`} back />
      <div className="relative aspect-[3/1] bg-accent-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.bannerUrl && <img src={p.bannerUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="px-4">
        <div className="flex items-end justify-between">
          <div className="-mt-12 rounded-full border-4 border-bg sm:-mt-16">
            <span className="sm:hidden"><Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={84} /></span>
            <span className="hidden sm:block"><Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={128} /></span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {p.viewer.isSelf ? (
              <Link href="/settings/profile" className="btn-outline">Edit profile</Link>
            ) : (
              viewer && (
                <>
                  <ProfileMenu userId={p.id} handle={p.handle} blocked={p.viewer.blocked} muted={p.viewer.muted} />
                  {!p.viewer.blocked && <FollowButton userId={p.id} following={p.viewer.follows} />}
                </>
              )
            )}
            {!viewer && <Link href="/login" className="btn bg-fg text-bg">Follow</Link>}
          </div>
        </div>
        <div className="mt-2">
          <h2 className="flex items-center gap-1 text-xl font-extrabold">
            {p.displayName} {p.verified && <VerifiedBadge size={20} />}
          </h2>
          <p className="text-muted">
            @{p.handle} {p.viewer.followsYou && <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-xs">Follows you</span>}
          </p>
        </div>
        {p.status === "suspended" && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">This account is suspended.</p>}
        {p.bio && <p className="mt-3 whitespace-pre-wrap text-[15px]">{p.bio}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-muted">
          {p.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow me" className="flex items-center gap-1 text-accent hover:underline">
              <LinkIcon size={16} /> {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          ))}
          <span className="flex items-center gap-1">
            <CalendarIcon size={16} /> Joined {new Date(p.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="mt-3 mb-3 flex gap-4 text-[15px]">
          {p.following === null ? (
            <span className="text-muted">Follower lists hidden</span>
          ) : (
            <>
              <Link href={`/u/${p.handle}/following`} className="hover:underline"><b>{p.following.toLocaleString()}</b> <span className="text-muted">Following</span></Link>
              <Link href={`/u/${p.handle}/followers`} className="hover:underline"><b>{p.followers!.toLocaleString()}</b> <span className="text-muted">Followers</span></Link>
            </>
          )}
        </div>
      </div>
      <div className="border-b border-line">
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
        <p className="px-6 py-16 text-center text-muted">You blocked @{p.handle}. Unblock from the ••• menu to see their posts.</p>
      ) : (
        <>
          {pinned && !pinned.gone && (
            <div>
              <p className="flex items-center gap-2 px-4 pt-2 pl-12 text-[13px] font-semibold text-muted"><PinIcon size={14} /> Pinned</p>
              <PostCard post={pinned} />
            </div>
          )}
          <Feed initial={feed} source={{ tab: "profile", handle: p.handle, ptab: tab }} prependOwn={p.viewer.isSelf && tab === "posts"} empty={`No ${tab} yet.`} />
        </>
      )}
    </>
  );
}
