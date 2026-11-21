"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createNoteAction, flagNoteAction, rateNoteAction } from "@/actions/notes";
import type { NoteView } from "@/lib/notes/notes";
import { useToast, useViewer } from "../providers";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { NoteCard } from "./NoteCard";

const VALUES = [
  { v: "helpful", label: "Helpful" },
  { v: "somewhat", label: "Somewhat helpful" },
  { v: "not_helpful", label: "Not helpful" },
] as const;
type Reasons = Record<"helpful" | "somewhat" | "not_helpful", readonly string[]>;

function RateNote({ note, reasons, flagReasons }: { note: NoteView; reasons: Reasons; flagReasons: readonly string[] }) {
  const [value, setValue] = useState<keyof Reasons | null>(note.myRating);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(!!note.myRating);
  const [flagging, setFlagging] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <li className="border-b border-[var(--hairline)] py-3">
      <p className="text-[15px] leading-snug text-ink-1">{note.body}</p>
      <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="tap mt-1 inline-block text-[12.5px] text-[var(--wn-blue-ink)] hover:underline">Source: {note.sourceDomain} ↗</a>
      {note.mine ? (
        <p className="mt-1 text-[12.5px] text-ink-3">Your note · {note.ratings} rating{note.ratings === 1 ? "" : "s"} so far · shows publicly once people who usually disagree both rate it helpful.</p>
      ) : done ? (
        <p className="mt-1 text-[12.5px] text-ink-3">You rated this {VALUES.find((x) => x.v === value)?.label.toLowerCase()}. <button type="button" className="tap underline" onClick={() => setDone(false)}>Change</button></p>
      ) : (
        <fieldset className="mt-2">
          <legend className="text-[12.5px] text-ink-3">Is this note helpful?</legend>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup">
            {VALUES.map((x) => (
              <button key={x.v} type="button" role="radio" aria-checked={value === x.v} onClick={() => (setValue(x.v), setReason(""))} className={`min-h-9 rounded-full px-3 text-[13px] ring-1 ${value === x.v ? "bg-[var(--wn-blue-fill)] text-white ring-transparent" : "text-ink-2 ring-[var(--hairline)] hover:text-ink-1"}`}>{x.label}</button>
            ))}
          </div>
          {value && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[200px] flex-1"><span className="sr-only">Reason</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="input !min-h-10 !text-[14px]">
                  <option value="">Pick a reason…</option>
                  {reasons[value].map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <Button size="sm" disabled={!reason || pending} onClick={() => start(async () => {
                const r = await rateNoteAction(note.id, value, reason);
                if (!r.ok) return toast(r.error, "error");
                setDone(true);
                toast(r.data === "published" ? "Thanks. This note is now public." : "Thanks for rating.");
                router.refresh();
              })}>Rate</Button>
            </div>
          )}
        </fieldset>
      )}
      {!note.mine && (
        <div className="mt-1">
          {flagging ? (
            <label className="flex items-center gap-2 text-[12.5px] text-ink-3">Report this note:
              <select defaultValue="" onChange={(e) => e.target.value && start(async () => {
                const r = await flagNoteAction(note.id, e.target.value);
                toast(r.ok ? "Reported. A moderator will look at it." : r.error, r.ok ? "ok" : "error");
                setFlagging(false);
              })} className="input !min-h-9 !w-auto !text-[13px]"><option value="">Pick a reason…</option>{flagReasons.map((r) => <option key={r}>{r}</option>)}</select>
            </label>
          ) : (
            <button type="button" className="tap text-[12.5px] text-ink-3 hover:text-ink-1 hover:underline" onClick={() => setFlagging(true)}>Report</button>
          )}
        </div>
      )}
    </li>
  );
}

export function WriteNote({ targetType, targetId, open, onClose }: { targetType: "post" | "story"; targetId: string; open: boolean; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [src, setSrc] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title="Add a context note">
      <form className="space-y-3 px-4 pb-6" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createNoteAction({ targetType, targetId, body, sourceUrl: src });
          if (!r.ok) return toast(r.error, "error");
          toast("Note added. It shows publicly once raters who usually disagree both find it helpful.");
          setBody("");
          setSrc("");
          onClose();
          router.refresh();
        });
      }}>
        <p className="text-[13.5px] text-ink-3">Add facts that help people understand this, with a source. Stick to what the source shows; no opinions or name-calling.</p>
        <label className="block"><span className="label">Note</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={280} required className="input" placeholder="What context would help?" />
          <span className="mono mt-1 block text-right text-[12px] text-ink-3">{280 - body.length} left</span>
        </label>
        <label className="block"><span className="label">Source link (required)</span>
          <input value={src} onChange={(e) => setSrc(e.target.value)} type="url" inputMode="url" required placeholder="https://…" className="input" />
        </label>
        <Button type="submit" disabled={pending || body.trim().length < 20 || !src}>Submit note</Button>
      </form>
    </Sheet>
  );
}

/** Context notes for a dispatch or story: the public ones, notes waiting for ratings, and a way to add one. */
export function NotesPanel({ targetType, targetId, notes, reasons, flagReasons }: { targetType: "post" | "story"; targetId: string; notes: { published: NoteView[]; pending: NoteView[]; mine: NoteView[] }; reasons: Reasons; flagReasons: readonly string[] }) {
  const viewer = useViewer();
  const params = useSearchParams();
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    if (params.get("note") === "1" && viewer) setWriting(true);
  }, [params, viewer]);
  const mine = notes.mine.filter((n) => n.status !== "published");
  const toRate = notes.pending.filter((n) => !n.mine);
  return (
    <section id="notes" aria-labelledby="notes-h" className="px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="notes-h" className="text-[15px] font-bold">Context notes</h2>
        {viewer ? (
          <Button size="sm" variant="secondary" onClick={() => setWriting(true)}>Add a note</Button>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(targetType === "story" ? `/news/story/${targetId}` : `/p/${targetId}`)}`} className="tap text-[13px] text-[var(--wn-blue-ink)] underline">Log in to add or rate notes</Link>
        )}
      </div>
      {notes.published.map((n) => <NoteCard key={n.id} note={n} />)}
      {!notes.published.length && <p className="mt-1 text-[13.5px] text-ink-3">No public notes. Notes appear here once people who usually disagree both rate them helpful.</p>}
      {viewer && toRate.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-semibold text-ink-2">Needs your rating ({toRate.length})</h3>
          <ul>{toRate.map((n) => <RateNote key={n.id} note={n} reasons={reasons} flagReasons={flagReasons} />)}</ul>
        </>
      )}
      {viewer && mine.length > 0 && (
        <>
          <h3 className="mt-4 text-[13px] font-semibold text-ink-2">Your notes</h3>
          <ul>{mine.map((n) => <RateNote key={n.id} note={n} reasons={reasons} flagReasons={flagReasons} />)}</ul>
        </>
      )}
      <p className="mt-3 text-[12.5px] text-ink-3"><Link href="/help#notes" className="underline">How context notes work</Link></p>
      {viewer && <WriteNote targetType={targetType} targetId={targetId} open={writing} onClose={() => setWriting(false)} />}
    </section>
  );
}
