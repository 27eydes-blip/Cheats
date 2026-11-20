"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { LIMITS } from "@/config";
import type { PostView } from "@/lib/posts";
import type { UserMini } from "@/lib/users";
import { blockAction, bookmarkAction, muteAction, repostAction } from "@/actions/social";
import { deletePostAction, editPostAction, pinPostAction } from "@/actions/posts";
import { LinkCard } from "./post/LinkCard";
import { MediaGrid, MediaImg } from "./post/MediaGrid";
import { Poll } from "./post/Poll";
import { ReportDialog } from "./ReportDialog";
import { RichText } from "./RichText";
import { LocalDate, Time } from "./Time";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { Avatar } from "./ui/Avatar";
import { VerifiedSeal } from "./ui/Badge";
import { Button } from "./ui/Button";
import { useConfirm } from "./ui/Confirm";
import { Menu, type MenuItem } from "./ui/Menu";
import { StanceChip, StanceMeter } from "./ui/Stance";
import { Reactions } from "./post/Reactions";
import { FlashBadge } from "./post/FlashBadge";
import { celebrate } from "./Celebrate";
import { shareAction } from "@/actions/social";
import { AmplifyIcon, AnswerIcon, BlockIcon, EditIcon, FlagIcon, LinkIcon, MoreIcon, MuteIcon, PinIcon, QuoteIcon, SaveIcon, ShareIcon, TrashIcon } from "./icons";
import { useComposer, useToast, useViewer } from "./providers";

/** Byline: name, gold seal, handle, and a mono timestamp. */
export function AuthorLine({ author, createdAt, editedAt, big }: { author: UserMini; createdAt: number; editedAt?: number | null; big?: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <Link href={`/u/${author.handle}`} className={`inline-flex min-w-0 items-center gap-1 py-[3px] font-semibold text-ink-1 hover:underline ${big ? "text-[16px]" : "text-[14.5px]"}`} onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{author.displayName}</span>
        {author.verified && <VerifiedSeal size={big ? 16 : 14} />}
      </Link>
      <span className="truncate text-[13px] text-ink-3">@{author.handle}</span>
      {!big && (
        <span className="mono shrink-0 text-[11.5px] text-ink-3">
          · <Time ms={createdAt} />
        </span>
      )}
      {editedAt && <span className="mono shrink-0 text-[11px] text-ink-3" title="Edited after posting">· edited</span>}
    </div>
  );
}

function Gone({ kind }: { kind: NonNullable<PostView["gone"]> }) {
  const text = kind === "expired" ? "This Flash dispatch has expired." : kind === "deleted" ? "This dispatch was deleted by its author." : kind === "removed" ? "This dispatch was removed for breaking the Community Guidelines." : "This dispatch is unavailable.";
  return <p className="border-l-2 border-rule-strong bg-paper-2 px-3.5 py-3 text-[14px] text-ink-3 italic">{text}</p>;
}

/** A quoted take, set like a pull-quote. */
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
      className="flex cursor-pointer gap-3 border-l-[3px] border-gold bg-paper-2 py-2.5 pr-3 pl-3.5 transition-colors hover:bg-paper-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={20} />
          <AuthorLine author={post.author} createdAt={post.createdAt} />
        </div>
        {post.body && <p className="mt-1 line-clamp-3 text-[15px] leading-snug break-words whitespace-pre-wrap text-ink-1">{post.body}</p>}
      </div>
      {post.media[0] && <div className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[8px]"><MediaImg m={post.media[0]} sizes="72px" /></div>}
    </div>
  );
}

/** Long takes fade out and expand smoothly to their full height. */
function Expandable({ children, long, big }: { children: React.ReactNode; long: boolean; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) setFull(ref.current.scrollHeight);
  }, [children]);
  const collapsed = 150;
  const needs = long && (full === null || full > collapsed + 24);
  return (
    <>
      <div
        ref={ref}
        className={`relative overflow-hidden break-words whitespace-pre-wrap ${big ? "font-display text-[clamp(1.25rem,1.1rem+0.6vw,1.55rem)] leading-[1.4] tracking-[-0.01em]" : "text-[15.5px] leading-[1.55]"}`}
        style={needs ? { maxHeight: open ? (full ?? 2000) : collapsed, transition: "max-height 420ms var(--ease-out)" } : undefined}
      >
        {children}
        {needs && !open && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-paper to-transparent" />}
      </div>
      {needs && !open && (
        <button type="button" className="folio mt-1.5 !text-[11px] text-navy-ink hover:underline" onClick={(e) => (e.stopPropagation(), setOpen(true))}>
          Read the rest
        </button>
      )}
    </>
  );
}

type Props = { post: PostView; repostedBy?: UserMini | null; focus?: boolean; compact?: boolean; onGone?: (id: string) => void; threadLine?: boolean; index?: number; hideStory?: boolean; /** inside a feed card: no divider line or row hover */ flat?: boolean; /** feed controls (Show more / Not interested / Mute topic) added to the ••• menu */ extraMenu?: MenuItem[] };

/**
 * A Dispatch. The author's stance chip and the Story it belongs to sit above
 * the text; readers use the stance meter and the action row: Respond, Relay,
 * Boost (tap; hold for the five reactions), Vault and Share.
 */
export function PostCard({ post: initial, repostedBy, focus, compact, onGone, threadLine, index, hideStory, flat, extraMenu }: Props) {
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

  /** Amplify / Save, optimistic with rollback. */
  function toggle(kind: "reposted" | "bookmarked") {
    if (needLogin()) return;
    const on = !post.viewer[kind];
    const shift = (p: PostView, val: boolean, delta: number) => ({
      ...p,
      viewer: { ...p.viewer, [kind]: val },
      counts: kind === "reposted" ? { ...p.counts, reposts: Math.max(0, p.counts.reposts + delta) } : p.counts,
    });
    setPost((p) => shift(p, on, on ? 1 : -1));
    start(async () => {
      const res = await (kind === "reposted" ? repostAction : bookmarkAction)(post.id, on);
      if (!res.ok) {
        setPost((p) => shift(p, !on, on ? -1 : 1));
        toast(res.error, "error");
      } else toast(kind === "reposted" ? (on ? "Relayed" : "Relay removed") : on ? "Added to your Vault" : "Removed from your Vault");
    });
  }

  const link = () => `${window.location.origin}/p/${post.id}`;
  async function share() {
    const url = link();
    if (viewer) shareAction({ type: "post", id: post.id }).then((r) => r.ok && r.data.length && celebrate({ kind: "achievement", earned: r.data })).catch(() => {});
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
    { label: "Quote this dispatch", icon: <QuoteIcon size={18} />, onSelect: () => !needLogin() && openComposer({ quote: post }) },
    { label: "Copy link", icon: <LinkIcon size={18} />, onSelect: () => navigator.clipboard?.writeText(link()).then(() => toast("Link copied")) },
  ];
  if (isAuthor) {
    if (post.viewer.canEdit) menu.push({ label: "Edit", hint: "15 min", icon: <EditIcon size={18} />, onSelect: () => (setDraft(post.body), setEditing(true)) });
    if (!post.replyTo)
      menu.push({
        label: "Pin / unpin on your profile",
        icon: <PinIcon size={18} />,
        onSelect: () => start(async () => {
          const r = await pinPostAction(post.id);
          toast(r.ok ? (r.data ? "Pinned to your profile" : "Unpinned") : r.error, r.ok ? "ok" : "error");
        }),
      });
    menu.push("divider", {
      label: "Delete dispatch",
      danger: true,
      icon: <TrashIcon size={18} />,
      onSelect: async () => {
        if (!(await confirm({ title: "Delete this dispatch?", body: "This can't be undone. Responses stay, with a note that the dispatch was deleted.", confirm: "Delete", danger: true }))) return;
        start(async () => {
          const r = await deletePostAction(post.id);
          if (!r.ok) return toast(r.error, "error");
          toast("Dispatch deleted");
          setHidden(true);
          onGone?.(post.id);
          if (focus) router.push("/");
        });
      },
    });
  } else if (viewer) {
    const h = post.author.handle;
    menu.push(
      { label: `Mute @${h}`, icon: <MuteIcon size={18} />, onSelect: () => start(async () => {
        const r = await muteAction(post.author.id, true);
        toast(r.ok ? `Muted @${h}` : r.error, r.ok ? "ok" : "error");
        if (r.ok && !focus) setHidden(true);
      }) },
      { label: `Block @${h}`, icon: <BlockIcon size={18} />, onSelect: async () => {
        if (!(await confirm({ title: `Block @${h}?`, body: "They won't see your dispatches and you won't see theirs. Follows between you are removed.", confirm: "Block", danger: true }))) return;
        start(async () => {
          const r = await blockAction(post.author.id, true);
          toast(r.ok ? `Blocked @${h}` : r.error, r.ok ? "ok" : "error");
          if (r.ok) setHidden(true);
        });
      } },
      "divider",
      { label: "Report dispatch", danger: true, icon: <FlagIcon size={18} />, onSelect: () => setReporting(true) },
    );
  }

  if (extraMenu?.length) menu.unshift(...extraMenu, "divider");

  const go = (e: React.MouseEvent) => {
    if (focus || editing) return;
    const el = e.target as HTMLElement;
    if (el.closest("a,button,input,textarea,select,label,[role=menu],[role=link],dialog") || window.getSelection()?.toString()) return;
    router.push(`/p/${post.id}`);
  };

  const action = "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[12px] px-2 text-[12.5px] font-semibold text-ink-2 transition-all duration-150 active:scale-90";
  const size = compact ? 36 : focus ? 48 : 42;

  return (
    <article
      data-post-id={post.id}
      tabIndex={-1}
      onClick={go}
      aria-labelledby={`post-${post.id}-author`}
      className={`relative outline-none ${compact ? "py-3" : "px-4 sm:px-5"} ${focus ? "pt-5 pb-2" : compact ? "" : flat ? "cursor-pointer pt-3.5 pb-2 focus-visible:shadow-[inset_3px_0_0_var(--wn-cyan)]" : "cv-auto cursor-pointer border-b border-rule py-4 transition-colors duration-150 hover:bg-paper-2/60 focus-visible:bg-gold-soft focus-visible:shadow-[inset_3px_0_0_var(--gold)]"}`}
      style={!flat && index !== undefined && index < 8 ? { animation: `enter 380ms var(--ease-out) ${index * 35}ms both` } : undefined}
    >
      {repostedBy && (
        <p className="folio mb-2 flex items-center gap-1.5 !text-[10px] text-ink-3">
          <AmplifyIcon size={13} className="text-gold-ink" /> Relayed by{" "}
          <Link href={`/u/${repostedBy.handle}`} className="text-ink-2 hover:underline" onClick={(e) => e.stopPropagation()}>{viewer?.id === repostedBy.id ? "you" : repostedBy.displayName}</Link>
        </p>
      )}
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Link href={`/u/${post.author.handle}`} onClick={(e) => e.stopPropagation()} tabIndex={-1} aria-hidden="true">
            <Avatar url={post.author.avatarUrl} name={post.author.displayName} handle={post.author.handle} size={size} live={post.author.live} stance={post.stance === "agree" || post.stance === "disagree" || post.stance === "context" ? post.stance : null} />
          </Link>
          {threadLine && <div className="mt-2 w-px flex-1 bg-rule-strong" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div id={`post-${post.id}-author`} className="min-w-0 leading-tight">
              <AuthorLine author={post.author} createdAt={post.createdAt} editedAt={post.editedAt} big={focus} />
            </div>
            {!post.gone && !compact && <div className="-mt-2.5 -mr-2.5"><Menu label="Dispatch options" items={menu} button={<MoreIcon size={18} />} buttonClassName="flex h-11 w-11 items-center justify-center rounded-[12px] text-ink-3 hover:bg-white/[0.06] hover:text-ink-1" /></div>}
          </div>

          {(post.stance || (post.story && !hideStory) || post.replyTo || post.flashExpiresAt) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {post.flashExpiresAt && !post.gone && <FlashBadge expiresAt={post.flashExpiresAt} />}
              {post.stance && <StanceChip stance={post.stance} />}
              {post.story && !hideStory && (
                <Link href={`/news/story/${post.story.key}`} onClick={(e) => e.stopPropagation()} className="min-w-0 truncate text-[12.5px] font-semibold text-gold-ink hover:underline">
                  on: {post.story.title}
                </Link>
              )}
              {post.replyTo && !focus && !post.story && (
                <span className="text-[12.5px] text-ink-3">Responding to <Link className="font-semibold text-navy-ink hover:underline" href={`/u/${post.replyTo.handle}`} onClick={(e) => e.stopPropagation()}>@{post.replyTo.handle}</Link></span>
              )}
            </div>
          )}

          <div className={focus ? "mt-3" : "mt-1.5"}>
            {post.gone ? (
              <Gone kind={post.gone} />
            ) : editing ? (
              <div onClick={(e) => e.stopPropagation()}>
                <label htmlFor={`edit-${post.id}`} className="sr-only">Edit dispatch</label>
                <textarea id={`edit-${post.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="input" autoFocus />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className={`mono mr-auto text-[12px] ${[...draft].length > LIMITS.postChars ? "text-disagree" : "text-ink-3"}`}>{LIMITS.postChars - [...draft].length} left</span>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => start(async () => {
                    const r = await editPostAction(post.id, draft);
                    if (!r.ok) return toast(r.error, "error");
                    setPost(r.data);
                    setEditing(false);
                    toast("Dispatch updated");
                  })}>Save</Button>
                </div>
              </div>
            ) : (
              <>
                {post.body && <Expandable long={!focus && post.body.length > 240} big={focus}><RichText text={post.body} /></Expandable>}
                {!compact && post.media.length > 0 && <MediaGrid media={post.media} />}
                {!compact && post.link && <LinkCard link={post.link} />}
                {post.source && (
                  <a href={post.source.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()} className="mt-2 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-[8px] bg-[rgb(34_211_238/0.08)] px-2 text-[12.5px] font-semibold text-[var(--wn-cyan-ink)] ring-1 ring-[rgb(34_211_238/0.3)] hover:ring-[var(--wn-cyan)]" title={post.source.url}>
                    <LinkIcon size={13} /> <span className="truncate">Source: {post.source.domain}</span>
                  </a>
                )}
                {post.poll && !compact && <Poll poll={post.poll} postId={post.id} isAuthor={post.viewer.isAuthor} createdAt={post.createdAt} />}
                {post.quote && !compact && <div className="mt-3"><QuoteEmbed post={post.quote} /></div>}
              </>
            )}
          </div>

          {focus && (
            <p className="mono mt-4 border-b border-rule pb-3 text-[12px] text-ink-3">
              <LocalDate ms={post.createdAt} />
              {post.counts.quotes > 0 && <> · {post.counts.quotes} quote{post.counts.quotes === 1 ? "" : "s"}</>}
            </p>
          )}

          {!post.gone && !compact && (
            <div className={focus ? "border-b border-rule py-2" : "mt-2.5"}>
              <StanceMeter type="post" id={post.id} initial={post.split} />
              {/* Actions: Respond · Relay · Boost · Vault · Share */}
              <div className="-mx-2 mt-1 flex items-center justify-between">
                <button type="button" data-action="reply" onClick={(e) => (e.stopPropagation(), !needLogin() && openComposer({ replyTo: post }))} className={`${action} hover:bg-navy-soft hover:text-navy-ink`} aria-label={`Respond${post.counts.replies ? `, ${post.counts.replies} responses` : ""}`}>
                  <AnswerIcon size={19} /><span className="hidden min-[420px]:inline">Respond</span><AnimatedNumber value={post.counts.replies} hideZero className="mono text-[12px]" />
                </button>
                <button type="button" data-action="relay" onClick={(e) => (e.stopPropagation(), toggle("reposted"))} aria-pressed={post.viewer.reposted} className={`${action} ${post.viewer.reposted ? "text-[var(--wn-cyan-ink)]" : ""} hover:bg-[rgb(34_211_238/0.1)] hover:text-[var(--wn-cyan-ink)]`} aria-label={`${post.viewer.reposted ? "Relayed" : "Relay"}${post.counts.reposts ? `, ${post.counts.reposts} relays` : ""}`} title="Relay to your followers">
                  <span key={String(post.viewer.reposted)} className={post.viewer.reposted ? "animate-pop" : ""}><AmplifyIcon size={19} /></span>
                  <span className="hidden min-[420px]:inline">Relay</span>
                  <AnimatedNumber value={post.counts.reposts} hideZero className="mono text-[12px]" />
                </button>
                <Reactions postId={post.id} counts={post.reactions} mine={post.viewer.reaction} />
                <button type="button" data-action="vault" onClick={(e) => (e.stopPropagation(), toggle("bookmarked"))} aria-pressed={post.viewer.bookmarked} className={`${action} ${post.viewer.bookmarked ? "text-navy-ink" : ""} hover:bg-navy-soft hover:text-navy-ink`} aria-label={post.viewer.bookmarked ? "In your Vault. Remove" : "Add to Vault"} title="Vault">
                  <span key={String(post.viewer.bookmarked)} className={post.viewer.bookmarked ? "animate-pop" : ""}><SaveIcon size={19} filled={post.viewer.bookmarked} /></span>
                  <span className="hidden min-[420px]:inline">Vault</span>
                </button>
                <button type="button" data-action="share" onClick={(e) => (e.stopPropagation(), share())} className={`${action} hover:bg-white/[0.06] hover:text-ink-1`} aria-label="Share">
                  <ShareIcon size={19} /><span className="hidden min-[420px]:inline">Share</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {reporting && <ReportDialog open onClose={() => setReporting(false)} targetType="post" targetId={post.id} label="take" />}
    </article>
  );
}
