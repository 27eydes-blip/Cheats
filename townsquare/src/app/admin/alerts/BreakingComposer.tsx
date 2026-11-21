"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { previewBreakingAction, sendBreakingAction } from "@/actions/alerts";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";

type Preview = { key: string; payload: { title: string; body: string; url: string }; alreadySent: { sent_at: number } | null; recipients: number };

export function BreakingComposer({ stories }: { stories: { key: string; title: string; importance: number; outlets: number; sent: boolean }[] }) {
  const [mode, setMode] = useState<"story" | "custom">("story");
  const [storyKey, setStoryKey] = useState(stories.find((s) => !s.sent)?.key ?? "");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const input = () => (mode === "story" ? { storyKey, title: title || undefined } : { title, url });
  const show = () => start(async () => {
    const r = await previewBreakingAction(input());
    if (!r.ok) return toast(r.error, "error");
    setPreview(r.data as Preview);
  });
  return (
    <section aria-labelledby="compose" className="mx-4 mt-6 sm:mx-6">
      <h2 id="compose" className="text-[17px] font-bold">New alert</h2>
      <div role="radiogroup" aria-label="Alert source" className="mt-2 flex gap-2">
        {(["story", "custom"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => (setMode(m), setPreview(null))} className={`min-h-10 rounded-full px-4 text-[14px] ring-1 ${mode === m ? "bg-[var(--wn-blue-fill)] text-white ring-transparent" : "text-ink-2 ring-[var(--hairline)]"}`}>{m === "story" ? "A story" : "Custom text and link"}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3">
        {mode === "story" ? (
          <>
            <label className="block"><span className="label">Story</span>
              <select className="input" value={storyKey} onChange={(e) => (setStoryKey(e.target.value), setPreview(null))}>
                {stories.map((s) => <option key={s.key} value={s.key} disabled={s.sent}>{s.sent ? "(sent) " : ""}{s.title.slice(0, 90)} · score {Math.round(s.importance)} · {s.outlets} outlets</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Alert text (optional, defaults to the headline)</span><input className="input" maxLength={140} value={title} onChange={(e) => (setTitle(e.target.value), setPreview(null))} /></label>
          </>
        ) : (
          <>
            <label className="block"><span className="label">Alert text</span><input className="input" maxLength={140} value={title} onChange={(e) => (setTitle(e.target.value), setPreview(null))} /></label>
            <label className="block"><span className="label">Link on this site</span><input className="input" placeholder="/news/story/…" value={url} onChange={(e) => (setUrl(e.target.value), setPreview(null))} /></label>
          </>
        )}
        <div><Button variant="secondary" disabled={pending} onClick={show}>Preview</Button></div>
      </div>
      {preview && (
        <div className="mt-4">
          <p className="text-[12.5px] text-ink-3">How it will look on a phone</p>
          <div className="mt-1 flex max-w-[380px] gap-3 rounded-[18px] bg-[#1c2233] p-3 text-white shadow-2">
            <LogoMark size={36} className="rounded-[8px]" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">{preview.payload.title} <span className="font-normal text-white/60">· WorldNet · now</span></p>
              <p className="text-[14px] leading-snug whitespace-pre-line">{preview.payload.body}</p>
            </div>
          </div>
          <p className="mt-2 text-[13.5px] text-ink-2">Opens {preview.payload.url} · up to {preview.recipients} people (minus anyone in quiet hours or over their daily limit).</p>
          {preview.alreadySent ? (
            <p className="mt-2 font-semibold text-[var(--disagree)]">Already sent. A story can only be sent once.</p>
          ) : (
            <Button variant="danger" className="mt-2" disabled={pending} onClick={async () => {
              if (!(await confirm({ title: "Send this breaking alert?", body: `It goes to up to ${preview.recipients} people right away and can't be sent again.`, confirm: "Send alert", danger: true }))) return;
              start(async () => {
                const r = await sendBreakingAction(input());
                if (!r.ok) return toast(r.error, "error");
                toast(`Sent to ${r.data.sent} of ${r.data.users} people`);
                setPreview(null);
                router.refresh();
              });
            }}>Send breaking alert</Button>
          )}
        </div>
      )}
    </section>
  );
}
