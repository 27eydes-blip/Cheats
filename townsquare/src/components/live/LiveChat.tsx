"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { PostView } from "@/lib/posts";
import { createPostAction } from "@/actions/posts";
import { Avatar } from "../ui/Avatar";
import { ArrowUpIcon } from "../icons";
import { useToast, useViewer } from "../providers";
import { Time } from "../Time";

/** Live chat: posts tagged with the show's hashtag, refreshed every 8 seconds. */
export function LiveChat({ tag, initial }: { tag: string | null; initial: PostView[] }) {
  const viewer = useViewer();
  const toast = useToast();
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!tag) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/feed?tab=search&q=${encodeURIComponent(`#${tag}`)}`).catch(() => null);
      if (r?.ok) setMsgs(((await r.json()) as { items: { post: PostView }[] }).items.map((i) => i.post));
    }, 8000);
    return () => clearInterval(t);
  }, [tag]);

  if (!tag) return null;
  const ordered = [...msgs].reverse();
  return (
    <section aria-labelledby="chat" className="mx-4 mt-5 mb-6 overflow-hidden border-t border-[var(--wn-glass-border)] ring-1 ring-rule sm:mx-6">
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-2.5">
        <h2 id="chat" className="text-[15px] font-semibold">Live chat</h2>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><span className="h-1.5 w-1.5 animate-live rounded-full bg-live" />#{tag}</span>
      </div>
      <ul ref={list} className="flex max-h-[380px] flex-col gap-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {ordered.length === 0 && <li className="py-6 text-center text-[14px] text-ink-3">Say hi to start the chat.</li>}
        {ordered.map((m) => (
          <li key={m.id} className="flex animate-enter gap-2.5">
            <Avatar url={m.author.avatarUrl} name={m.author.displayName} handle={m.author.handle} size={26} ring={false} />
            <p className="min-w-0 text-[14px] leading-snug">
              <Link href={`/u/${m.author.handle}`} className="mr-1.5 font-semibold hover:underline">{m.author.displayName}</Link>
              <span className="text-ink-2">{m.body.replace(new RegExp(`\\s*#${tag}\\b`, "i"), "")}</span>
              <span className="ml-1.5 text-[11.5px] text-ink-3"><Time ms={m.createdAt} /></span>
            </p>
          </li>
        ))}
      </ul>
      {viewer ? (
        <form
          className="flex items-center gap-2 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const f = new FormData();
            f.set("body", `${text.trim()} #${tag}`);
            start(async () => {
              const r = await createPostAction(f);
              if (!r.ok) return toast(r.error, "error");
              setMsgs((cur) => [r.data.post, ...cur]);
              setText("");
            });
          }}
        >
          <label htmlFor="chat-input" className="sr-only">Chat message</label>
          <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Say something…" className="input !rounded-full !py-2.5" />
          <button type="submit" disabled={pending || !text.trim()} className="btn-primary !h-11 !w-11 !min-h-11 !px-0" aria-label="Send">
            <ArrowUpIcon size={18} strokeWidth={2.4} />
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-[14px] text-ink-3"><Link href="/login" className="font-semibold text-accent">Log in</Link> to chat.</p>
      )}
    </section>
  );
}
