"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "@/config";
import type { PostView } from "@/lib/posts";
import { createPostAction } from "@/actions/posts";
import { Avatar } from "./ui/Avatar";
import { CloseIcon, ImageIcon, PollIcon } from "./icons";
import { POSTED_EVENT, useToast, useViewer } from "./providers";
import { QuoteEmbed } from "./PostCard";

type Pic = { file: File; url: string; alt: string };

/** Count characters the way the server does (emoji = 1). */
const count = (s: string) => [...s.trim()].length;

/**
 * The composer. In `compact` mode (top of Home, under a post) it starts as a
 * single line and expands in place when focused; in the sheet it opens expanded.
 */
export function Composer({
  replyTo, quote, onPosted, autoFocus, compact, communityId, prefill,
}: { replyTo?: PostView; quote?: PostView; onPosted?: (p: PostView) => void; autoFocus?: boolean; compact?: boolean; communityId?: string; prefill?: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState(prefill ? `${prefill} ` : "");
  const [pics, setPics] = useState<Pic[]>([]);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [pollHours, setPollHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => pics.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grow the textarea with its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 420)}px`;
  }, [body, expanded]);

  const used = count(body);
  const left = LIMITS.postChars - used;
  const canPost = !pending && left >= 0 && (used > 0 || pics.length > 0 || !!quote) && (!poll || (used > 0 && poll.filter((o) => o.trim()).length >= 2));
  const ring = Math.min(1, used / LIMITS.postChars);

  if (!viewer) return null;
  const idBase = `composer-${replyTo?.id ?? quote?.id ?? communityId ?? (compact ? "inline" : "new")}`;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = LIMITS.imagesPerPost - pics.length;
    const accepted: Pic[] = [];
    for (const f of [...list].slice(0, room)) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
        setError("Only JPEG, PNG, WebP, and GIF images are allowed.");
        continue;
      }
      if (f.size > LIMITS.imageBytes) {
        setError("Each image must be under 8 MB.");
        continue;
      }
      accepted.push({ file: f, url: URL.createObjectURL(f), alt: "" });
    }
    if (list.length > room) setError(`You can attach up to ${LIMITS.imagesPerPost} images.`);
    setPics((p) => [...p, ...accepted]);
    setPoll(null);
    setExpanded(true);
  }

  function submit() {
    setError(null);
    const form = new FormData();
    form.set("body", body);
    if (replyTo) form.set("replyToId", replyTo.id);
    if (quote) form.set("quoteOfId", quote.id);
    if (communityId) form.set("communityId", communityId);
    for (const p of pics) {
      form.append("images", p.file);
      form.append("alts", p.alt);
    }
    if (poll) {
      form.set("hasPoll", "1");
      form.set("pollHours", String(pollHours));
      poll.forEach((o) => form.append("pollOption", o));
    }
    start(async () => {
      const res = await createPostAction(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      pics.forEach((p) => URL.revokeObjectURL(p.url));
      setPics([]);
      setPoll(null);
      if (compact) setExpanded(false);
      window.dispatchEvent(new CustomEvent(POSTED_EVENT, { detail: res.data.post }));
      toast(replyTo ? "Reply sent" : "Posted", "ok", `/p/${res.data.id}`);
      onPosted?.(res.data.post);
      router.refresh();
    });
  }

  const collapseIfEmpty = (e: React.FocusEvent) => {
    if (!compact || rootRef.current?.contains(e.relatedTarget as Node)) return;
    if (!body.trim() && !pics.length && !poll) setExpanded(false);
  };

  return (
    <div ref={rootRef} onBlur={collapseIfEmpty} className={compact ? "px-4 py-3 sm:px-5" : "px-4 pt-1 pb-4 sm:px-6"}>
      {replyTo && !compact && (
        <div className="mb-3 rounded-[var(--r-md)] bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink-2">
          <span className="text-ink-3">Replying to</span> <b className="text-ink-1">@{replyTo.author.handle}</b>
          {replyTo.body && <p className="mt-0.5 line-clamp-2 text-ink-3">{replyTo.body}</p>}
        </div>
      )}
      {viewer.suspended && <p className="mb-3 rounded-[var(--r-md)] bg-danger-soft p-3 text-[14px] text-danger">Your account is suspended, so you can&apos;t post right now.</p>}
      <div className="flex gap-3">
        <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={compact && !expanded ? 40 : 44} />
        <div className="min-w-0 flex-1">
          <label htmlFor={idBase} className="sr-only">{replyTo ? "Write your reply" : "Write a post"}</label>
          <textarea
            id={idBase}
            ref={taRef}
            autoFocus={autoFocus}
            value={body}
            onFocus={() => setExpanded(true)}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canPost) submit();
            }}
            placeholder={replyTo ? "Post your reply" : poll ? "Ask a question…" : communityId ? "Start a discussion…" : "What's happening?"}
            rows={1}
            className={`w-full resize-none bg-transparent leading-snug placeholder:text-ink-3 focus:outline-none ${expanded ? "min-h-[3.2em] py-2 text-[19px]" : "py-2 text-[17px]"}`}
          />

          {pics.length > 0 && (
            <ul className={`mt-2 grid gap-2 ${pics.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {pics.map((p, i) => (
                <li key={p.url} className="relative animate-scale-in overflow-hidden rounded-[var(--r-md)] ring-1 ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt || `Attachment ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPics((all) => all.filter((x) => x !== p));
                    }}
                    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur"
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <CloseIcon size={16} />
                  </button>
                  <label className="block bg-surface">
                    <span className="sr-only">Alt text for image {i + 1}</span>
                    <input
                      value={p.alt}
                      maxLength={LIMITS.altChars}
                      onChange={(e) => setPics((all) => all.map((x) => (x === p ? { ...x, alt: e.target.value } : x)))}
                      placeholder="+ Describe this image (alt text)"
                      className="w-full bg-transparent px-3 py-2 text-[13.5px] placeholder:text-ink-3 focus:outline-none"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {poll && (
            <fieldset className="mt-2 animate-scale-in rounded-[var(--r-lg)] bg-surface-2 p-3">
              <legend className="sr-only">Poll</legend>
              <div className="space-y-2">
                {poll.map((o, i) => (
                  <input
                    key={i}
                    value={o}
                    maxLength={LIMITS.pollOptions.chars}
                    onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`Choice ${i + 1}${i >= 2 ? " (optional)" : ""}`}
                    aria-label={`Poll choice ${i + 1}`}
                    className="input !py-2.5"
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                {poll.length < LIMITS.pollOptions.max ? (
                  <button type="button" className="text-[14px] font-semibold text-accent" onClick={() => setPoll([...poll, ""])}>+ Add choice</button>
                ) : <span />}
                <label className="flex items-center gap-2 text-[14px] text-ink-2">
                  Ends in
                  <select value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))} className="input !w-auto !py-1.5">
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>1 day</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                  </select>
                </label>
                <button type="button" className="text-[14px] font-semibold text-danger" onClick={() => setPoll(null)}>Remove</button>
              </div>
            </fieldset>
          )}

          {quote && <div className="mt-2"><QuoteEmbed post={quote} /></div>}

          {error && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{error}</p>}

          {/* Toolbar: animates open in compact mode (grid-rows trick) */}
          <div className="grid transition-[grid-template-rows] duration-[380ms] ease-[var(--ease-out)]" style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}>
            <div className="min-h-0 overflow-hidden">
              <div className="mt-2 flex items-center gap-0.5 border-t border-line pt-2.5">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent-soft disabled:opacity-40" onClick={() => fileRef.current?.click()} disabled={pics.length >= LIMITS.imagesPerPost || !!poll} aria-label="Add images" title="Add images" tabIndex={expanded ? 0 : -1}>
                  <ImageIcon size={21} />
                </button>
                {!replyTo && (
                  <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent-soft disabled:opacity-40" onClick={() => setPoll(poll ? null : ["", ""])} disabled={pics.length > 0} aria-label="Add a poll" aria-pressed={!!poll} title="Add a poll" tabIndex={expanded ? 0 : -1}>
                    <PollIcon size={21} />
                  </button>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {used > 0 && (
                    <span className={`num flex items-center gap-1.5 text-[13px] ${left < 0 ? "text-danger" : left < 30 ? "text-warning" : "text-ink-3"}`}>
                      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="-rotate-90">
                        <circle cx="12" cy="12" r="9.5" stroke="var(--line-strong)" strokeWidth="2.5" fill="none" />
                        <circle cx="12" cy="12" r="9.5" stroke={left < 0 ? "var(--danger)" : left < 30 ? "var(--warning)" : "var(--accent)"} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray={`${ring * 59.7} 59.7`} style={{ transition: "stroke-dasharray 200ms" }} />
                      </svg>
                      {left < 30 && <span>{left}</span>}
                      <span className="sr-only">{left} characters left</span>
                    </span>
                  )}
                  <button type="button" className="btn-primary !min-h-10 !px-5" disabled={!canPost || viewer.suspended} onClick={submit} tabIndex={expanded ? 0 : -1}>
                    {pending ? "Posting…" : replyTo ? "Reply" : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
