"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendMessageAction } from "@/actions/menu";
import type { MessageView } from "@/lib/messages";
import { ArrowUpIcon } from "@/components/icons";
import { useToast } from "@/components/providers";

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** A conversation: bubbles, a composer pinned above the tab bar, and a quiet check for new messages every few seconds. */
export function Thread({ peer, initial, blockedReason }: { peer: { id: string; handle: string; displayName: string }; initial: MessageView[]; blockedReason: string | null }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const end = useRef<HTMLDivElement>(null);
  const last = useRef(initial.at(-1)?.createdAt ?? 0);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/messages?with=${peer.handle}&after=${last.current}`).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json()) as { messages: MessageView[] };
      if (!d.messages.length) return;
      last.current = d.messages.at(-1)!.createdAt;
      setMsgs((cur) => [...cur, ...d.messages.filter((m) => !cur.some((x) => x.id === m.id))]);
    }, 4000);
    return () => clearInterval(t);
  }, [peer.handle]);

  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    setText("");
    start(async () => {
      const r = await sendMessageAction(peer.id, body);
      if (!r.ok) return (setText(body), toast(r.error, "error"));
      last.current = Math.max(last.current, r.data.createdAt);
      setMsgs((cur) => [...cur, r.data]);
    });
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h)-var(--dock-h)-180px)] flex-col">
      <ol aria-label={`Conversation with ${peer.displayName}`} aria-live="polite" className="flex-1 space-y-1.5 px-3 py-4 sm:px-4">
        {msgs.length === 0 && <li className="py-10 text-center text-[14.5px] text-ink-3">Say hello to {peer.displayName}. Messages are private between the two of you.</li>}
        {msgs.map((m, i) => {
          const newDay = i === 0 || day(m.createdAt) !== day(msgs[i - 1].createdAt);
          return (
            <li key={m.id}>
              {newDay && <p className="mono py-3 text-center text-[11px] text-ink-3" suppressHydrationWarning>{day(m.createdAt)}</p>}
              <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[82%] rounded-[18px] px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap animate-rise ${m.mine ? "rounded-br-[6px] bg-[var(--wn-blue-fill)] text-white" : "rounded-bl-[6px] bg-[var(--wn-panel-2)] text-ink-1 ring-1 ring-rule"}`}>
                  {m.body}
                  <span className={`mono ml-2 inline-block text-[10px] ${m.mine ? "text-white/80" : "text-ink-3"}`} suppressHydrationWarning>{time(m.createdAt)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={end} />
      <div className="sticky bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom))] z-10 border-t border-rule bg-[var(--glass-strong)] p-2.5 backdrop-blur-xl lg:bottom-0">
        {blockedReason ? (
          <p role="status" className="px-2 py-2 text-center text-[13.5px] text-ink-3">{blockedReason}</p>
        ) : (
          <form onSubmit={(e) => (e.preventDefault(), send())} className="flex items-end gap-2">
            <label htmlFor="dm" className="sr-only">Message {peer.displayName}</label>
            <textarea id="dm" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())} rows={1} maxLength={1000} placeholder={`Message @${peer.handle}`} className="input max-h-32 min-h-11 flex-1 resize-none !rounded-[16px] !py-2.5" />
            <button type="submit" disabled={!text.trim() || pending} aria-label="Send" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--wn-blue-fill)] text-white shadow-[0_6px_18px_-6px_rgb(47_107_255/0.8)] transition-transform active:scale-90 disabled:opacity-40"><ArrowUpIcon size={20} strokeWidth={2.4} /></button>
          </form>
        )}
      </div>
    </div>
  );
}
