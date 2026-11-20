"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "@/config";
import type { PostView } from "@/lib/posts";
import { createPostAction } from "@/actions/posts";
import { Avatar } from "./ui/Avatar";
import { StanceChip, type TakeStance } from "./ui/Stance";
import { AgreeIcon, CloseIcon, ContextIcon, DisagreeIcon, ImageIcon, LinkIcon, PollIcon, QuestionIcon } from "./icons";
import { POSTED_EVENT, useToast, useViewer } from "./providers";
import { QuoteEmbed } from "./PostCard";

type Pic = { file: File; url: string; alt: string };
type StoryOpt = { key: string; title: string; section: string };

const count = (s: string) => [...s.trim()].length;
const STANCES: [TakeStance, string, typeof AgreeIcon, string][] = [
  ["agree", "Agree", AgreeIcon, "bg-agree !text-on-signal"],
  ["disagree", "Disagree", DisagreeIcon, "bg-disagree !text-on-signal"],
  ["context", "Context", ContextIcon, "bg-gold !text-navy"],
  ["question", "Question", QuestionIcon, "bg-navy"],
];

/**
 * Take it: pick a Story (optional), pick your stance, write up to 500
 * characters. Answers can take a stance too. Images or a poll are optional.
 */
export function Composer({
  replyTo, quote, onPosted, autoFocus, compact, communityId, prefill, storyKey: presetStory,
}: { replyTo?: PostView; quote?: PostView; onPosted?: (p: PostView) => void; autoFocus?: boolean; compact?: boolean; communityId?: string; prefill?: string; storyKey?: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState(prefill ? `${prefill} ` : "");
  const [pics, setPics] = useState<Pic[]>([]);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [pollHours, setPollHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [stories, setStories] = useState<StoryOpt[]>([]);
  const [storyKey, setStoryKey] = useState<string>(presetStory ?? "");
  const [stance, setStance] = useState<TakeStance | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canPickStory = !replyTo && !communityId;

  useEffect(() => () => pics.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canPickStory || !expanded || stories.length) return;
    fetch("/api/stories").then((r) => r.json()).then((list: StoryOpt[]) => setStories(list)).catch(() => {});
  }, [canPickStory, expanded, stories.length]);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 380)}px`;
  }, [body, expanded]);

  const used = count(body);
  const left = LIMITS.postChars - used;
  const needsStance = !!storyKey && !replyTo;
  const canPost = !pending && left >= 0 && (used > 0 || pics.length > 0 || !!quote) && (!poll || (used > 0 && poll.filter((o) => o.trim()).length >= 2)) && (!needsStance || !!stance);
  const ring = Math.min(1, used / LIMITS.postChars);

  if (!viewer) return null;
  const idBase = `composer-${replyTo?.id ?? quote?.id ?? communityId ?? (compact ? "inline" : "new")}`;
  const story = stories.find((s) => s.key === storyKey);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = LIMITS.imagesPerPost - pics.length;
    const accepted: Pic[] = [];
    for (const f of [...list].slice(0, room)) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { setError("Only JPEG, PNG, WebP, and GIF images are allowed."); continue; }
      if (f.size > LIMITS.imageBytes) { setError("Each image must be under 8 MB."); continue; }
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
    if (storyKey && !replyTo) form.set("storyKey", storyKey);
    if (stance) form.set("stance", stance);
    if (source?.trim()) form.set("sourceUrl", source.trim());
    for (const p of pics) (form.append("images", p.file), form.append("alts", p.alt));
    if (poll) {
      form.set("hasPoll", "1");
      form.set("pollHours", String(pollHours));
      poll.forEach((o) => form.append("pollOption", o));
    }
    start(async () => {
      const res = await createPostAction(form);
      if (!res.ok) return setError(res.error);
      setBody("");
      pics.forEach((p) => URL.revokeObjectURL(p.url));
      setPics([]);
      setPoll(null);
      setStance(null);
      if (compact) setExpanded(false);
      window.dispatchEvent(new CustomEvent(POSTED_EVENT, { detail: res.data.post }));
      toast(replyTo ? "Response filed" : "Dispatch filed", "ok", `/p/${res.data.id}`);
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
        <div className="mb-3 border-l-[3px] border-gold bg-paper-2 px-3.5 py-2.5 text-[14px]">
          <span className="folio !text-[10px] text-ink-3">Responding to</span> <b>@{replyTo.author.handle}</b>
          {replyTo.stance && <span className="ml-2"><StanceChip stance={replyTo.stance} /></span>}
          {replyTo.body && <p className="mt-1 line-clamp-2 text-ink-2">{replyTo.body}</p>}
        </div>
      )}
      {viewer.suspended && <p className="mb-3 border-l-2 border-disagree bg-danger-soft p-3 text-[14px] text-disagree">Your account is suspended, so you can&apos;t file dispatches right now.</p>}

      {canPickStory && expanded && (
        <label className="mb-3 block">
          <span className="folio !text-[10px] text-ink-3">Story</span>
          <select value={storyKey} onChange={(e) => (setStoryKey(e.target.value), !e.target.value && setStance(null))} className="input mt-1 !py-2 !text-[14px]">
            <option value="">No story: a general dispatch</option>
            {stories.map((s) => <option key={s.key} value={s.key}>{s.section} · {s.title}</option>)}
          </select>
        </label>
      )}

      {(needsStance || replyTo || (storyKey && !replyTo)) && expanded && (
        <fieldset className="mb-3">
          <legend className="folio mb-1.5 !text-[10px] text-ink-3">{replyTo ? "Your stance (optional)" : `Your stance${story ? ` on “${story.title.slice(0, 48)}${story.title.length > 48 ? "…" : ""}”` : ""}`}</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {STANCES.map(([v, label, Icon, on]) => (
              <button
                key={v}
                type="button"
                aria-pressed={stance === v}
                onClick={() => setStance(stance === v ? null : v)}
                className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[11.5px] font-bold tracking-wide transition-all active:translate-y-px sm:flex-row sm:gap-1.5 sm:text-[13px] ${stance === v ? `${on} text-white` : "text-ink-2 ring-1 ring-rule hover:ring-rule-strong"}`}
              >
                <Icon size={16} strokeWidth={1.9} /> {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex gap-3">
        <Avatar url={viewer.avatarUrl} name={viewer.displayName} handle={viewer.handle} size={compact && !expanded ? 38 : 42} stance={stance === "agree" || stance === "disagree" || stance === "context" ? stance : null} />
        <div className="min-w-0 flex-1">
          <label htmlFor={idBase} className="sr-only">{replyTo ? "Write your response" : "Write your dispatch"}</label>
          <textarea
            id={idBase}
            ref={taRef}
            autoFocus={autoFocus}
            value={body}
            onFocus={() => setExpanded(true)}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && canPost && submit()}
            placeholder={replyTo ? `Respond to @${replyTo.author.handle}…` : poll ? "Ask the question…" : communityId ? "Start a discussion…" : storyKey ? "What's your read?" : "Dispatch: what's your read on the news?"}
            rows={1}
            className={`w-full resize-none bg-transparent leading-snug placeholder:text-ink-3 focus:outline-none ${expanded ? "min-h-[3.4em] py-1.5 text-[18px]" : "py-2 text-[16px]"}`}
          />

          {pics.length > 0 && (
            <ul className={`mt-2 grid gap-2 ${pics.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {pics.map((p, i) => (
                <li key={p.url} className="relative animate-scale-in overflow-hidden rounded-[10px] ring-1 ring-rule">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.alt || `Attachment ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                  <button type="button" onClick={() => (URL.revokeObjectURL(p.url), setPics((all) => all.filter((x) => x !== p)))} className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-[10px] bg-black/65 text-white" aria-label={`Remove image ${i + 1}`}><CloseIcon size={16} /></button>
                  <label className="block bg-paper">
                    <span className="sr-only">Alt text for image {i + 1}</span>
                    <input value={p.alt} maxLength={LIMITS.altChars} onChange={(e) => setPics((all) => all.map((x) => (x === p ? { ...x, alt: e.target.value } : x)))} placeholder="+ Describe this image (alt text)" className="w-full bg-transparent px-3 py-2 text-[13.5px] placeholder:text-ink-3 focus:outline-none" />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {poll && (
            <fieldset className="mt-2 animate-scale-in border-l-2 border-gold bg-paper-2 p-3">
              <legend className="sr-only">Poll</legend>
              <div className="space-y-2">
                {poll.map((o, i) => <input key={i} value={o} maxLength={LIMITS.pollOptions.chars} onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Choice ${i + 1}${i >= 2 ? " (optional)" : ""}`} aria-label={`Poll choice ${i + 1}`} className="input !py-2.5" />)}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                {poll.length < LIMITS.pollOptions.max ? <button type="button" className="text-[13.5px] font-semibold text-navy-ink" onClick={() => setPoll([...poll, ""])}>+ Add choice</button> : <span />}
                <label className="flex items-center gap-2 text-[13.5px] text-ink-2">Ends in
                  <select value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))} className="input !w-auto !py-1.5">
                    <option value={1}>1 hour</option><option value={6}>6 hours</option><option value={24}>1 day</option><option value={72}>3 days</option><option value={168}>7 days</option>
                  </select>
                </label>
                <button type="button" className="text-[13.5px] font-semibold text-disagree" onClick={() => setPoll(null)}>Remove</button>
              </div>
            </fieldset>
          )}

          {source !== null && (
            <div className="mt-2 flex animate-scale-in items-center gap-2 rounded-[10px] bg-white/[0.03] p-2 ring-1 ring-rule">
              <LinkIcon size={16} className="shrink-0 text-[var(--wn-cyan-ink)]" />
              <label className="sr-only" htmlFor="src-url">Source link</label>
              <input id="src-url" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source link (https://…) — raises your Credibility" inputMode="url" maxLength={500} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
              <button type="button" onClick={() => setSource(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-3 hover:bg-white/5" aria-label="Remove source"><CloseIcon size={15} /></button>
            </div>
          )}

          {quote && <div className="mt-2"><QuoteEmbed post={quote} /></div>}
          {error && <p role="alert" className="mt-2 text-[14px] font-medium text-disagree">{error}</p>}

          <div className="grid transition-[grid-template-rows] duration-[380ms] ease-[var(--ease-out)]" style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}>
            <div className="min-h-0 overflow-hidden">
              <div className="mt-2 flex items-center gap-0.5 border-t border-rule pt-2.5">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-navy-ink hover:bg-navy-soft disabled:opacity-40" onClick={() => fileRef.current?.click()} disabled={pics.length >= LIMITS.imagesPerPost || !!poll} aria-label="Add images" title="Add images" tabIndex={expanded ? 0 : -1}><ImageIcon size={20} /></button>
                {!replyTo && <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-navy-ink hover:bg-navy-soft disabled:opacity-40" onClick={() => setPoll(poll ? null : ["", ""])} disabled={pics.length > 0} aria-label="Add a poll" aria-pressed={!!poll} title="Add a poll" tabIndex={expanded ? 0 : -1}><PollIcon size={20} /></button>}
                <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-navy-ink hover:bg-navy-soft" onClick={() => setSource(source === null ? "" : null)} aria-label="Add a source link" aria-pressed={source !== null} title="Add a source" tabIndex={expanded ? 0 : -1}><LinkIcon size={20} /></button>
                <div className="ml-auto flex items-center gap-3">
                  {needsStance && !stance && <span className="text-[12.5px] text-ink-3">Pick a stance</span>}
                  {used > 0 && (
                    <span className={`mono flex items-center gap-1.5 text-[12px] ${left < 0 ? "text-disagree" : left < 30 ? "text-warning" : "text-ink-3"}`}>
                      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="-rotate-90">
                        <circle cx="12" cy="12" r="9.5" stroke="var(--rule-strong)" strokeWidth="2.5" fill="none" />
                        <circle cx="12" cy="12" r="9.5" stroke={left < 0 ? "var(--disagree)" : left < 30 ? "var(--warning)" : "var(--gold)"} strokeWidth="2.5" fill="none" strokeDasharray={`${ring * 59.7} 59.7`} style={{ transition: "stroke-dasharray 200ms" }} />
                      </svg>
                      {left < 30 && <span>{left}</span>}
                      <span className="sr-only">{left} characters left</span>
                    </span>
                  )}
                  <button type="button" className="btn-primary !min-h-10 !px-5" disabled={!canPost || viewer.suspended} onClick={submit} tabIndex={expanded ? 0 : -1}>
                    {pending ? "Filing…" : replyTo ? "Respond" : "Dispatch"}
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
