"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LIMITS } from "@/config";
import type { PollView, PostView } from "@/lib/posts";
import type { UserMini } from "@/lib/users";
import { bookmarkAction, blockAction, likeAction, muteAction, repostAction } from "@/actions/social";
import { deletePostAction, editPostAction, pinPostAction, votePollAction } from "@/actions/posts";
import { Avatar } from "./Avatar";
import { Menu, type MenuItem } from "./Menu";
import { ReportDialog } from "./ReportDialog";
import { RichText } from "./RichText";
import { LocalDate, Time, useNow } from "./Time";
import {
  BlockIcon, BookmarkIcon, EditIcon, FlagIcon, HeartIcon, LinkIcon, MoreIcon, MuteIcon, PinIcon, QuoteIcon, ReplyIcon, RepostIcon, ShareIcon, TrashIcon, VerifiedBadge,
} from "./icons";
import { useComposer, useToast, useViewer } from "./providers";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export function AuthorLine({ author, createdAt, editedAt, big }: { author: UserMini; createdAt: number; editedAt?: number | null; big?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-1 ${big ? "flex-wrap" : ""}`}>
      <Link href={`/u/${author.handle}`} className="truncate font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
        {author.displayName}
      </Link>
      {author.verified && <VerifiedBadge />}
      <span className="truncate text-muted">@{author.handle}</span>
      {!big && (
        <>
          <span className="text-muted" aria-hidden="true">·</span>
          <span className="shrink-0 text-muted">
            <Time ms={createdAt} />
          </span>
        </>
      )}
      {editedAt && (
        <span className="shrink-0 text-xs text-muted" title="Edited after posting">
          · edited
        </span>
      )}
    </div>
  );
}

function Gone({ kind }: { kind: NonNullable<PostView["gone"]> }) {
  const text = kind === "deleted" ? "This post was deleted by its author." : kind === "removed" ? "This post was removed for breaking the Community Guidelines." : "This post is unavailable.";
  return <p className="rounded-xl border border-line bg-surface px-3 py-3 text-sm text-muted">{text}</p>;
}

/** A compact embedded post (used for quote-posts and in the composer). */
export function QuoteEmbed({ post }: { post: PostView }) {
  const router = useRouter();
  if (post.gone) return <Gone kind={post.gone} />;
  const open = () => router.push(`/p/${post.id}`);
  // A clickable box rather than <a>, because the author line inside already contains links.
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Quoted post by ${post.author.displayName}`}
      onClick={(e) => (e.stopPropagation(), open())}
      onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), open())}
      className="block cursor-pointer rounded-xl border border-line p-3 hover:bg-surface"
    >
      <div className="flex items-center gap-2 text-[15px]">
        <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={20} />
        <AuthorLine author={post.author} createdAt={post.createdAt} />
      </div>
      {post.body && <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[15px]">{post.body}</p>}
      {post.media[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.media[0].url} alt={post.media[0].alt} className="mt-2 max-h-60 w-full rounded-lg object-cover" loading="lazy" />
      )}
    </div>
  );
}

function MediaGrid({ media }: { media: PostView["media"] }) {
  const n = media.length;
  return (
    <div className={`mt-2 grid gap-0.5 overflow-hidden rounded-2xl border border-line ${n === 1 ? "grid-cols-1" : "grid-cols-2"} ${n > 2 ? "aspect-[16/10] grid-rows-2" : ""}`}>
      {media.map((m, i) => (
        <a
          key={m.id}
          href={m.url}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          className={`block bg-surface ${n === 3 && i === 0 ? "row-span-2" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.url}
            alt={m.alt || "Image"}
            loading="lazy"
            width={m.width ?? undefined}
            height={m.height ?? undefined}
            className={`h-full w-full object-cover ${n === 1 ? "max-h-[520px]" : n === 2 ? "aspect-[4/5]" : ""}`}
          />
        </a>
      ))}
    </div>
  );
}

function Poll({ poll, postId, isAuthor }: { poll: PollView; postId: string; isAuthor: boolean }) {
  const viewer = useViewer();
  const toast = useToast();
  const [p, setP] = useState(poll);
  const [pending, start] = useTransition();
  const showResults = !viewer || !!p.myVote || p.closed || isAuthor;
  const now = useNow();
  const left = p.closesAt - (now ?? p.closesAt);
  const leftText = !now ? "" : p.closed ? "Final results" : left > 86_400_000 ? `${Math.ceil(left / 86_400_000)} days left` : left > 3_600_000 ? `${Math.ceil(left / 3_600_000)} hours left` : `${Math.max(1, Math.ceil(left / 60_000))} minutes left`;
  return (
    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      {p.options.map((o) => {
        const pct = p.total ? Math.round((o.votes / p.total) * 100) : 0;
        return showResults ? (
          <div key={o.id} className="relative overflow-hidden rounded-lg border border-line">
            <div className={`absolute inset-y-0 left-0 ${p.myVote === o.id ? "bg-accent/25" : "bg-surface"}`} style={{ width: `${pct}%` }} aria-hidden="true" />
            <div className="relative flex min-h-10 items-center justify-between px-3 text-[15px]">
              <span className={p.myVote === o.id ? "font-bold" : ""}>
                {o.label} {p.myVote === o.id && <span className="sr-only">(your vote)</span>}
              </span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
          </div>
        ) : (
          <button
            key={o.id}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await votePollAction(p.id, o.id, postId);
                if (res.ok) setP(res.data);
                else toast(res.error, "error");
              })
            }
            className="flex min-h-10 w-full items-center justify-center rounded-full border border-accent px-3 text-[15px] font-semibold text-accent hover:bg-accent-soft"
          >
            {o.label}
          </button>
        );
      })}
      <p className="text-sm text-muted">
        {p.total.toLocaleString("en-US")} vote{p.total === 1 ? "" : "s"} · {leftText}
      </p>
    </div>
  );
}

type Props = { post: PostView; repostedBy?: UserMini | null; focus?: boolean; onGone?: (id: string) => void; threadLine?: boolean };

export function PostCard({ post: initial, repostedBy, focus, onGone, threadLine }: Props) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const openComposer = useComposer();
  const [post, setPost] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.body);
  const [reporting, setReporting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();

  if (hidden) return null;

  const needLogin = () => {
    if (viewer) return false;
    router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    return true;
  };

  /** Flip a boolean optimistically and roll back if the server says no. */
  function toggle(kind: "liked" | "reposted" | "bookmarked") {
    if (needLogin()) return;
    const on = !post.viewer[kind];
    const countKey = kind === "liked" ? "likes" : kind === "reposted" ? "reposts" : null;
    const apply = (val: boolean) =>
      setPost((p) => ({
        ...p,
        viewer: { ...p.viewer, [kind]: val },
        counts: countKey ? { ...p.counts, [countKey]: Math.max(0, p.counts[countKey] + (val === on ? (on ? 1 : -1) : 0)) } : p.counts,
      }));
    apply(on);
    start(async () => {
      const action = kind === "liked" ? likeAction : kind === "reposted" ? repostAction : bookmarkAction;
      const res = await action(post.id, on);
      if (!res.ok) {
        setPost((p) => ({ ...p, viewer: { ...p.viewer, [kind]: !on }, counts: countKey ? { ...p.counts, [countKey]: Math.max(0, p.counts[countKey] + (on ? -1 : 1)) } : p.counts }));
        toast(res.error, "error");
      } else if (kind === "bookmarked") toast(on ? "Added to bookmarks" : "Removed from bookmarks");
    });
  }

  const link = () => `${window.location.origin}/p/${post.id}`;
  async function share() {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ url, text: post.body.slice(0, 100) });
        return;
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard?.writeText(url);
    toast("Link copied");
  }

  const isAuthor = post.viewer.isAuthor;
  const menu: MenuItem[] = [
    { label: "Copy link", icon: <LinkIcon size={18} />, onSelect: () => navigator.clipboard?.writeText(link()).then(() => toast("Link copied")) },
  ];
  if (isAuthor) {
    if (post.viewer.canEdit) menu.push({ label: "Edit (15 min window)", icon: <EditIcon size={18} />, onSelect: () => (setDraft(post.body), setEditing(true)) });
    if (!post.replyTo)
      menu.push({
        label: "Pin to profile",
        icon: <PinIcon size={18} />,
        onSelect: () => start(async () => {
          const r = await pinPostAction(post.id);
          toast(r.ok ? "Pinned to your profile" : r.error, r.ok ? "ok" : "error");
        }),
      });
    menu.push("divider", {
      label: "Delete",
      danger: true,
      icon: <TrashIcon size={18} />,
      onSelect: () => {
        if (!confirm("Delete this post? This can't be undone.")) return;
        start(async () => {
          const r = await deletePostAction(post.id);
          if (!r.ok) return toast(r.error, "error");
          toast("Post deleted");
          setHidden(true);
          onGone?.(post.id);
          if (focus) router.push("/");
        });
      },
    });
  } else if (viewer) {
    const h = post.author.handle;
    menu.push(
      {
        label: `Mute @${h}`,
        icon: <MuteIcon size={18} />,
        onSelect: () => start(async () => {
          const r = await muteAction(post.author.id, true);
          toast(r.ok ? `Muted @${h}. You won't see their posts in feeds.` : r.error, r.ok ? "ok" : "error");
          if (r.ok && !focus) setHidden(true);
        }),
      },
      {
        label: `Block @${h}`,
        icon: <BlockIcon size={18} />,
        onSelect: () => {
          if (!confirm(`Block @${h}? They won't be able to see or interact with your posts, and you won't see theirs.`)) return;
          start(async () => {
            const r = await blockAction(post.author.id, true);
            toast(r.ok ? `Blocked @${h}` : r.error, r.ok ? "ok" : "error");
            if (r.ok) setHidden(true);
          });
        },
      },
      "divider",
      { label: "Report post", danger: true, icon: <FlagIcon size={18} />, onSelect: () => setReporting(true) },
    );
  }

  const long = !focus && post.body.length > 280;
  const go = (e: React.MouseEvent) => {
    if (focus || editing) return;
    const el = e.target as HTMLElement;
    if (el.closest("a,button,input,textarea,select,label,[role=menu]") || window.getSelection()?.toString()) return;
    router.push(`/p/${post.id}`);
  };

  return (
    <article
      onClick={go}
      aria-labelledby={`post-${post.id}-author`}
      className={`relative border-b border-line px-4 ${focus ? "pt-3 pb-1" : "cursor-pointer py-3 hover:bg-surface/60"}`}
    >
      {repostedBy && (
        <p className="mb-1 flex items-center gap-2 pl-8 text-[13px] font-semibold text-muted">
          <RepostIcon size={15} /> <Link href={`/u/${repostedBy.handle}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{viewer?.id === repostedBy.id ? "You" : repostedBy.displayName}</Link> reposted
        </p>
      )}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Link href={`/u/${post.author.handle}`} onClick={(e) => e.stopPropagation()} tabIndex={-1} aria-hidden="true">
            <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={44} />
          </Link>
          {threadLine && <div className="mt-1 w-0.5 flex-1 bg-line" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div id={`post-${post.id}-author`} className="min-w-0 text-[15px]">
              <AuthorLine author={post.author} createdAt={post.createdAt} editedAt={post.editedAt} big={focus} />
            </div>
            {!post.gone && <Menu label="More options" items={menu} button={<MoreIcon size={20} />} />}
          </div>
          {post.replyTo && !focus && (
            <p className="text-[14px] text-muted">
              Replying to{" "}
              <Link className="text-accent hover:underline" href={`/u/${post.replyTo.handle}`} onClick={(e) => e.stopPropagation()}>
                @{post.replyTo.handle}
              </Link>
            </p>
          )}

          {post.gone ? (
            <div className="mt-1 mb-2">
              <Gone kind={post.gone} />
            </div>
          ) : editing ? (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <label htmlFor={`edit-${post.id}`} className="sr-only">Edit post</label>
              <textarea id={`edit-${post.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="input text-[16px]" />
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className={`mr-auto text-sm ${[...draft].length > LIMITS.postChars ? "text-danger" : "text-muted"}`}>{LIMITS.postChars - [...draft].length} left</span>
                <button type="button" className="btn-outline" onClick={() => setEditing(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    start(async () => {
                      const r = await editPostAction(post.id, draft);
                      if (!r.ok) return toast(r.error, "error");
                      setPost(r.data);
                      setEditing(false);
                      toast("Post updated");
                    })
                  }
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {post.body && (
                <div className={`mt-0.5 whitespace-pre-wrap break-words ${focus ? "text-[19px] leading-relaxed" : "text-[15px] leading-normal"} ${long && !expanded ? "line-clamp-6" : ""}`}>
                  <RichText text={post.body} />
                </div>
              )}
              {long && !expanded && (
                <button type="button" className="mt-0.5 text-[15px] font-semibold text-accent hover:underline" onClick={(e) => (e.stopPropagation(), setExpanded(true))}>
                  Read more
                </button>
              )}
              {post.media.length > 0 && <MediaGrid media={post.media} />}
              {post.link && (
                <a href={post.link.url} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()} className="mt-2 flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><LinkIcon /></span>
                  <span className="min-w-0">
                    <span className="block text-sm text-muted">{post.link.domain}</span>
                    {post.link.title && <span className="block truncate font-semibold capitalize">{post.link.title}</span>}
                  </span>
                </a>
              )}
              {post.poll && <Poll poll={post.poll} postId={post.id} isAuthor={post.viewer.isAuthor} />}
              {post.quote && (
                <div className="mt-2">
                  <QuoteEmbed post={post.quote} />
                </div>
              )}
            </>
          )}

          {focus && (
            <p className="mt-3 border-b border-line pb-3 text-[15px] text-muted">
              <LocalDate ms={post.createdAt} />
            </p>
          )}

          {!post.gone && (
            <div className={`-ml-2 flex max-w-md items-center justify-between ${focus ? "py-1" : "mt-1"}`}>
              <ActionButton label="Reply" count={post.counts.replies} onClick={() => !needLogin() && openComposer({ replyTo: post })} hover="accent">
                <ReplyIcon size={19} />
              </ActionButton>
              <Menu
                label={post.viewer.reposted ? "Undo repost or quote" : "Repost or quote"}
                align="left"
                button={
                  <span className={`flex items-center gap-1.5 pr-1 text-[13px] tabular-nums ${post.viewer.reposted ? "text-success" : ""}`}>
                    <RepostIcon size={19} /> {post.counts.reposts > 0 && fmt(post.counts.reposts)}
                  </span>
                }
                items={[
                  { label: post.viewer.reposted ? "Undo repost" : "Repost", icon: <RepostIcon size={18} />, onSelect: () => toggle("reposted") },
                  { label: "Quote", icon: <QuoteIcon size={18} />, onSelect: () => !needLogin() && openComposer({ quote: post }) },
                ]}
              />
              <ActionButton label={post.viewer.liked ? "Unlike" : "Like"} pressed={post.viewer.liked} count={post.counts.likes} onClick={() => toggle("liked")} hover="like">
                <HeartIcon size={19} filled={post.viewer.liked} />
              </ActionButton>
              <ActionButton label={post.viewer.bookmarked ? "Remove bookmark" : "Bookmark"} pressed={post.viewer.bookmarked} onClick={() => toggle("bookmarked")} hover="accent">
                <BookmarkIcon size={19} filled={post.viewer.bookmarked} />
              </ActionButton>
              <ActionButton label="Share" onClick={share} hover="accent">
                <ShareIcon size={19} />
              </ActionButton>
            </div>
          )}
          {focus && post.counts.quotes > 0 && (
            <p className="pb-2 text-sm text-muted">{post.counts.quotes} quote{post.counts.quotes === 1 ? "" : "s"}</p>
          )}
        </div>
      </div>
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="post" targetId={post.id} label="post" />}
    </article>
  );
}

function ActionButton({ label, count, pressed, onClick, children, hover }: { label: string; count?: number; pressed?: boolean; onClick: () => void; children: React.ReactNode; hover: "accent" | "like" }) {
  const active = pressed ? (hover === "like" ? "text-rose-600" : "text-accent") : "text-muted";
  const hov = hover === "like" ? "hover:text-rose-600 hover:bg-rose-500/10" : "hover:text-accent hover:bg-accent-soft";
  return (
    <button
      type="button"
      aria-label={count ? `${label} (${count})` : label}
      aria-pressed={pressed}
      onClick={(e) => (e.stopPropagation(), onClick())}
      className={`flex h-10 min-w-10 items-center gap-1.5 rounded-full px-2 text-[13px] tabular-nums transition-colors ${active} ${hov}`}
    >
      {children}
      {!!count && <span>{fmt(count)}</span>}
    </button>
  );
}
