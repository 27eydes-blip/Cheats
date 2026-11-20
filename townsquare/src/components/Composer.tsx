"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "@/config";
import type { PostView } from "@/lib/posts";
import { createPostAction } from "@/actions/posts";
import { Avatar } from "./Avatar";
import { CloseIcon, ImageIcon, PollIcon } from "./icons";
import { POSTED_EVENT, useToast, useViewer } from "./providers";
import { QuoteEmbed } from "./PostCard";

type Pic = { file: File; url: string; alt: string };

/** Count characters the way the server does (emoji = 1). */
const count = (s: string) => [...s.trim()].length;

export function Composer({ replyTo, quote, onPosted, autoFocus, compact }: { replyTo?: PostView; quote?: PostView; onPosted?: (p: PostView) => void; autoFocus?: boolean; compact?: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [pics, setPics] = useState<Pic[]>([]);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [pollHours, setPollHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => pics.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grow the textarea with its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 420)}px`;
  }, [body]);

  const used = count(body);
  const left = LIMITS.postChars - used;
  const canPost = !pending && left >= 0 && (used > 0 || pics.length > 0 || !!quote) && (!poll || (used > 0 && poll.filter((o) => o.trim()).length >= 2));
  const ring = useMemo(() => Math.min(1, used / LIMITS.postChars), [used]);

  if (!viewer) return null;

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
  }

  function submit() {
    setError(null);
    const form = new FormData();
    form.set("body", body);
    if (replyTo) form.set("replyToId", replyTo.id);
    if (quote) form.set("quoteOfId", quote.id);
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
      window.dispatchEvent(new CustomEvent(POSTED_EVENT, { detail: res.data.post }));
      toast(replyTo ? "Reply sent" : "Posted", "ok", `/p/${res.data.id}`);
      onPosted?.(res.data.post);
      router.refresh();
    });
  }

  return (
    <div className={compact ? "px-4 pt-3 pb-2" : "p-4"}>
      {replyTo && (
        <p className="mb-2 pl-14 text-sm text-muted">
          Replying to <span className="text-accent">@{replyTo.author.handle}</span>
        </p>
      )}
      {viewer.suspended && <p className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">Your account is suspended, so you can&apos;t post right now.</p>}
      <div className="flex gap-3">
        <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={44} />
        <div className="min-w-0 flex-1">
          <label htmlFor={`composer-${replyTo?.id ?? quote?.id ?? "new"}`} className="sr-only">
            {replyTo ? "Write your reply" : "Write a post"}
          </label>
          <textarea
            id={`composer-${replyTo?.id ?? quote?.id ?? "new"}`}
            ref={taRef}
            autoFocus={autoFocus}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canPost) submit();
            }}
            placeholder={replyTo ? "Post your reply" : poll ? "Ask a question…" : "What's happening?"}
            rows={compact ? 2 : 3}
            className="w-full resize-none bg-transparent py-2 text-[19px] leading-snug placeholder:text-muted focus:outline-none"
          />

          {pics.length > 0 && (
            <ul className={`mt-2 grid gap-2 ${pics.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {pics.map((p, i) => (
                <li key={p.url} className="relative overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt || `Attachment ${i + 1}`} className="aspect-video w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPics((all) => all.filter((x) => x !== p));
                    }}
                    className="absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <CloseIcon size={16} />
                  </button>
                  <label className="block border-t border-line p-1.5">
                    <span className="sr-only">Alt text for image {i + 1}</span>
                    <input
                      value={p.alt}
                      maxLength={LIMITS.altChars}
                      onChange={(e) => setPics((all) => all.map((x) => (x === p ? { ...x, alt: e.target.value } : x)))}
                      placeholder="Describe this image (alt text)"
                      className="w-full bg-transparent px-1 py-1 text-sm placeholder:text-muted focus:outline-none"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {poll && (
            <fieldset className="mt-2 rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-semibold">Poll</legend>
              {poll.map((o, i) => (
                <input
                  key={i}
                  value={o}
                  maxLength={LIMITS.pollOptions.chars}
                  onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Choice ${i + 1}${i >= 2 ? " (optional)" : ""}`}
                  aria-label={`Poll choice ${i + 1}`}
                  className="input mb-2"
                />
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {poll.length < LIMITS.pollOptions.max ? (
                  <button type="button" className="text-sm font-semibold text-accent" onClick={() => setPoll([...poll, ""])}>
                    + Add choice
                  </button>
                ) : (
                  <span />
                )}
                <label className="flex items-center gap-2 text-sm">
                  Length
                  <select value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))} className="input w-auto py-1.5">
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>1 day</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                  </select>
                </label>
                <button type="button" className="text-sm font-semibold text-danger" onClick={() => setPoll(null)}>
                  Remove poll
                </button>
              </div>
            </fieldset>
          )}

          {quote && (
            <div className="mt-2">
              <QuoteEmbed post={quote} />
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            <button
              type="button"
              className="btn-ghost min-w-11 px-0 text-accent"
              onClick={() => fileRef.current?.click()}
              disabled={pics.length >= LIMITS.imagesPerPost || !!poll}
              aria-label="Add images"
              title="Add images"
            >
              <ImageIcon />
            </button>
            {!replyTo && (
              <button
                type="button"
                className="btn-ghost min-w-11 px-0 text-accent"
                onClick={() => setPoll(poll ? null : ["", ""])}
                disabled={pics.length > 0}
                aria-label="Add a poll"
                aria-pressed={!!poll}
                title="Add a poll"
              >
                <PollIcon />
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              {used > 0 && (
                <span className={`flex items-center gap-1.5 text-sm tabular-nums ${left < 0 ? "text-danger" : left < 30 ? "text-amber-600" : "text-muted"}`} aria-live="polite">
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                    <circle cx="11" cy="11" r="9" stroke="var(--border)" strokeWidth="2.5" fill="none" />
                    <circle cx="11" cy="11" r="9" stroke={left < 0 ? "var(--danger)" : "var(--accent)"} strokeWidth="2.5" fill="none" strokeDasharray={`${ring * 56.5} 56.5`} transform="rotate(-90 11 11)" />
                  </svg>
                  {left < 30 && <span>{left}</span>}
                  <span className="sr-only">{left} characters left</span>
                </span>
              )}
              <button type="button" className="btn-primary" disabled={!canPost || viewer.suspended} onClick={submit}>
                {pending ? "Posting…" : replyTo ? "Reply" : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
