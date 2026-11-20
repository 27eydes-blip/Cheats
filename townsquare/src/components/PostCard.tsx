"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { LIMITS } from "@/config";
import type { PostView } from "@/lib/posts";
import type { UserMini } from "@/lib/users";
import { blockAction, bookmarkAction, likeAction, muteAction, repostAction } from "@/actions/social";
import { deletePostAction, editPostAction, pinPostAction } from "@/actions/posts";
import { ActionBar } from "./post/ActionBar";
import { LinkCard } from "./post/LinkCard";
import { MediaGrid, MediaImg } from "./post/MediaGrid";
import { Poll } from "./post/Poll";
import { ReportDialog } from "./ReportDialog";
import { RichText } from "./RichText";
import { LocalDate, Time } from "./Time";
import { Avatar } from "./ui/Avatar";
import { VerifiedSeal } from "./ui/Badge";
import { Button } from "./ui/Button";
import { useConfirm } from "./ui/Confirm";
import { Menu, type MenuItem } from "./ui/Menu";
import { BlockIcon, EditIcon, FlagIcon, LinkIcon, MoreIcon, MuteIcon, PinIcon, RepostIcon, TrashIcon } from "./icons";
import { useComposer, useToast, useViewer } from "./providers";

export function AuthorLine({ author, createdAt, editedAt, big }: { author: UserMini; createdAt: number; editedAt?: number | null; big?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-1 ${big ? "flex-col items-start gap-0" : ""}`}>
      <span className="flex min-w-0 items-center gap-1">
        <Link href={`/u/${author.handle}`} className={`inline-block truncate py-[3px] font-semibold text-ink-1 hover:underline ${big ? "text-[16px]" : ""}`} onClick={(e) => e.stopPropagation()}>
          {author.displayName}
        </Link>
        {author.verified && <VerifiedSeal size={big ? 17 : 15} />}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-ink-3">
        <span className="truncate">@{author.handle}</span>
        {!big && (
          <>
            <span aria-hidden="true">·</span>
            <span className="shrink-0 hover:underline"><Time ms={createdAt} /></span>
          </>
        )}
        {editedAt && <span className="shrink-0 text-[12px]" title="Edited after posting">· edited</span>}
      </span>
    </div>
  );
}

function Gone({ kind }: { kind: NonNullable<PostView["gone"]> }) {
  const text = kind === "deleted" ? "This post was deleted by its author." : kind === "removed" ? "This post was removed for breaking the Community Guidelines." : "This post is unavailable.";
  return <p className="rounded-[var(--r-md)] bg-surface-2 px-3.5 py-3 text-[14px] text-ink-3">{text}</p>;
}

/** A quoted post, nested as a compact card with a thumbnail. */
export function QuoteEmbed({ post }: { post: PostView }) {
  const router = useRouter();
  if (post.gone) return <Gone kind={post.gone} />;
  const open = () => router.push(`/p/${post.id}`);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => (e.stopPropagation(), open())}
      onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), open())}
      className="flex cursor-pointer gap-3 rounded-[var(--r-lg)] bg-surface p-3 ring-1 ring-line transition-shadow duration-200 hover:shadow-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[14px]">
          <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={22} ring={false} />
          <AuthorLine author={post.author} createdAt={post.createdAt} />
        </div>
        {post.body && <p className="mt-1.5 line-clamp-3 text-[14.5px] leading-snug break-words whitespace-pre-wrap text-ink-2">{post.body}</p>}
      </div>
      {post.media[0] && (
        <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[var(--r-sm)]">
          <MediaImg m={post.media[0]} sizes="80px" />
        </div>
      )}
    </div>
  );
}

/** Long posts fade out and expand smoothly to their full height. */
function Expandable({ children, long, big }: { children: React.ReactNode; long: boolean; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) setFull(ref.current.scrollHeight);
  }, [children]);
  const collapsed = 156;
  const needs = long && (full === null || full > collapsed + 24);
  return (
    <>
      <div
        ref={ref}
        className={`relative overflow-hidden break-words whitespace-pre-wrap ${big ? "font-display text-[21px] leading-[1.45] tracking-[-0.01em]" : "text-[15.5px] leading-[1.5]"}`}
        style={needs ? { maxHeight: open ? (full ?? 2000) : collapsed, transition: "max-height 420ms var(--ease-out)" } : undefined}
      >
        {children}
        {needs && !open && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      {needs && !open && (
        <button type="button" className="mt-1 text-[14.5px] font-semibold text-accent hover:underline" onClick={(e) => (e.stopPropagation(), setOpen(true))}>
          Read more
        </button>
      )}
    </>
  );
}

type Props = { post: PostView; repostedBy?: UserMini | null; focus?: boolean; onGone?: (id: string) => void; threadLine?: boolean; index?: number };

export function PostCard({ post: initial, repostedBy, focus, onGone, threadLine, index }: Props) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const openComposer = useComposer();
  const [post, setPost] = useState(initial);
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

  /** Flip a boolean optimistically; roll back if the server refuses. */
  function toggle(kind: "liked" | "reposted" | "bookmarked") {
    if (needLogin()) return;
    const on = !post.viewer[kind];
    const countKey = kind === "liked" ? "likes" : kind === "reposted" ? "reposts" : null;
    const shift = (p: PostView, val: boolean, delta: number) => ({
      ...p,
      viewer: { ...p.viewer, [kind]: val },
      counts: countKey ? { ...p.counts, [countKey]: Math.max(0, p.counts[countKey] + delta) } : p.counts,
    });
    setPost((p) => shift(p, on, on ? 1 : -1));
    if (typeof navigator !== "undefined" && "vibrate" in navigator && on) navigator.vibrate?.(8);
    start(async () => {
      const action = kind === "liked" ? likeAction : kind === "reposted" ? repostAction : bookmarkAction;
      const res = await action(post.id, on);
      if (!res.ok) {
        setPost((p) => shift(p, !on, on ? -1 : 1));
        toast(res.error, "error");
      } else if (kind === "bookmarked") toast(on ? "Saved to bookmarks" : "Removed from bookmarks");
      else if (kind === "reposted" && on) toast("Reposted");
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
  const menu: MenuItem[] = [{ label: "Copy link", icon: <LinkIcon size={18} />, onSelect: () => navigator.clipboard?.writeText(link()).then(() => toast("Link copied")) }];
  if (isAuthor) {
    if (post.viewer.canEdit) menu.push({ label: "Edit", hint: "15 min", icon: <EditIcon size={18} />, onSelect: () => (setDraft(post.body), setEditing(true)) });
    if (!post.replyTo)
      menu.push({
        label: "Pin to profile",
        icon: <PinIcon size={18} />,
        onSelect: () =>
          start(async () => {
            const r = await pinPostAction(post.id);
            toast(r.ok ? "Pinned to your profile" : r.error, r.ok ? "ok" : "error");
          }),
      });
    menu.push("divider", {
      label: "Delete post",
      danger: true,
      icon: <TrashIcon size={18} />,
      onSelect: async () => {
        if (!(await confirm({ title: "Delete this post?", body: "This can't be undone. Replies stay, with a note that the post was deleted.", confirm: "Delete", danger: true }))) return;
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
        onSelect: () =>
          start(async () => {
            const r = await muteAction(post.author.id, true);
            toast(r.ok ? `Muted @${h}` : r.error, r.ok ? "ok" : "error");
            if (r.ok && !focus) setHidden(true);
          }),
      },
      {
        label: `Block @${h}`,
        icon: <BlockIcon size={18} />,
        onSelect: async () => {
          if (!(await confirm({ title: `Block @${h}?`, body: "They won't be able to see or interact with your posts, and you won't see theirs. Follows between you are removed.", confirm: "Block", danger: true }))) return;
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

  const go = (e: React.MouseEvent) => {
    if (focus || editing) return;
    const el = e.target as HTMLElement;
    if (el.closest("a,button,input,textarea,select,label,[role=menu],[role=link],dialog") || window.getSelection()?.toString()) return;
    router.push(`/p/${post.id}`);
  };

  return (
    <article
      data-post-id={post.id}
      tabIndex={-1}
      onClick={go}
      aria-labelledby={`post-${post.id}-author`}
      className={`relative px-4 outline-none sm:px-5 ${focus ? "pt-4 pb-1" : "cv-auto cursor-pointer border-b border-line py-3.5 transition-colors duration-150 hover:bg-surface-2/40 focus-visible:bg-accent-soft/50 focus-visible:shadow-[inset_3px_0_0_var(--accent)]"}`}
      style={index !== undefined && index < 8 ? { animation: `enter 380ms var(--ease-out) ${index * 35}ms both` } : undefined}
    >
      {repostedBy && (
        <p className="mb-1.5 flex items-center gap-2 pl-[30px] text-[13px] font-semibold text-ink-3">
          <RepostIcon size={14} className="text-success" />
          <Link href={`/u/${repostedBy.handle}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {viewer?.id === repostedBy.id ? "You" : repostedBy.displayName}
          </Link>{" "}
          reposted
        </p>
      )}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Link href={`/u/${post.author.handle}`} onClick={(e) => e.stopPropagation()} tabIndex={-1} aria-hidden="true">
            <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={focus ? 48 : 44} live={post.author.live} />
          </Link>
          {threadLine && <div className="mt-1.5 w-[2px] flex-1 rounded-full bg-line-strong" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div id={`post-${post.id}-author`} className="min-w-0 pt-0.5 text-[15px] leading-tight">
              <AuthorLine author={post.author} createdAt={post.createdAt} editedAt={post.editedAt} big={focus} />
            </div>
            {!post.gone && <div className="-mt-1.5 -mr-2"><Menu label="More options" items={menu} button={<MoreIcon size={19} />} /></div>}
          </div>
          {post.replyTo && !focus && (
            <p className="mt-0.5 text-[13.5px] text-ink-3">
              Replying to{" "}
              <Link className="text-accent hover:underline" href={`/u/${post.replyTo.handle}`} onClick={(e) => e.stopPropagation()}>
                @{post.replyTo.handle}
              </Link>
            </p>
          )}

          <div className={focus ? "mt-3" : "mt-1"}>
            {post.gone ? (
              <Gone kind={post.gone} />
            ) : editing ? (
              <div onClick={(e) => e.stopPropagation()}>
                <label htmlFor={`edit-${post.id}`} className="sr-only">Edit post</label>
                <textarea id={`edit-${post.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="input" autoFocus />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className={`num mr-auto text-[13px] ${[...draft].length > LIMITS.postChars ? "text-danger" : "text-ink-3"}`}>{LIMITS.postChars - [...draft].length} left</span>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button
                    size="sm"
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
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {post.body && (
                  <Expandable long={!focus && post.body.length > 260} big={focus}>
                    <RichText text={post.body} />
                  </Expandable>
                )}
                {post.media.length > 0 && <MediaGrid media={post.media} />}
                {post.link && <LinkCard link={post.link} />}
                {post.poll && <Poll poll={post.poll} postId={post.id} isAuthor={post.viewer.isAuthor} createdAt={post.createdAt} />}
                {post.quote && <div className="mt-3"><QuoteEmbed post={post.quote} /></div>}
              </>
            )}
          </div>

          {focus && (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 border-b border-line pb-3 text-[14px] text-ink-3">
              <LocalDate ms={post.createdAt} />
              {post.counts.quotes > 0 && <span><b className="num text-ink-1">{post.counts.quotes}</b> quote{post.counts.quotes === 1 ? "" : "s"}</span>}
            </p>
          )}

          {!post.gone && (
            <div className={focus ? "border-b border-line py-1" : "mt-1.5"}>
              <ActionBar
                big={focus}
                counts={post.counts}
                state={post.viewer}
                onReply={() => !needLogin() && openComposer({ replyTo: post })}
                onQuote={() => !needLogin() && openComposer({ quote: post })}
                onToggle={toggle}
                onShare={share}
              />
            </div>
          )}
        </div>
      </div>
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="post" targetId={post.id} label="post" />}
    </article>
  );
}
