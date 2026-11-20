"use client";

import { useState } from "react";
import type { PostView } from "@/lib/posts";
import { PostCard } from "../PostCard";
import { AgreeIcon, ContextIcon, DisagreeIcon, QuestionIcon } from "../icons";
import { RichText } from "../RichText";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";
import { StanceMeter } from "../ui/Stance";
import Link from "next/link";

/** A Context take shown as an inline note card (gold rule), not a regular take. */
function ContextNote({ p }: { p: PostView }) {
  return (
    <div className="border-l-[3px] border-gold bg-gold-soft px-4 py-3">
      <p className="folio flex items-center gap-1.5 !text-[10px] text-gold-ink"><ContextIcon size={13} /> Context note</p>
      <p className="mt-1.5 text-[15px] leading-relaxed"><RichText text={p.body.replace(/^Context:\s*/i, "").replace(/\s*#\w+\s*$/, "")} /></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/u/${p.author.handle}`} className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <Avatar url={p.author.avatarUrl} name={p.author.displayName} handle={p.author.handle} size={20} />
          <span className="font-semibold">{p.author.displayName}</span>{p.author.verified && <VerifiedSeal size={12} />}
        </Link>
        <span className="flex items-center gap-2 text-[12px] text-ink-3">Helpful? <StanceMeter type="post" id={p.id} initial={p.split} /></span>
      </div>
    </div>
  );
}

/**
 * The Takes on a Story: Agree and Disagree side by side on desktop (with a
 * toggle on phones), Context notes as inline cards, and open Questions.
 */
export function TakesBoard({ takes }: { takes: PostView[] }) {
  const by = (s: string) => takes.filter((t) => t.stance === s);
  const agree = by("agree");
  const disagree = by("disagree");
  const context = by("context");
  const questions = by("question");
  const other = takes.filter((t) => !t.stance);
  const [tab, setTab] = useState<"agree" | "disagree" | "context" | "question">("agree");
  const tabs: [typeof tab, string, number, typeof AgreeIcon][] = [
    ["agree", "Agree", agree.length, AgreeIcon],
    ["disagree", "Disagree", disagree.length, DisagreeIcon],
    ["context", "Context", context.length, ContextIcon],
    ["question", "Questions", questions.length, QuestionIcon],
  ];
  const column = (label: string, list: PostView[], tone: string, Icon: typeof AgreeIcon) => (
    <div className="min-w-0">
      <div className={`flex items-center justify-between border-t-[3px] pt-2 pb-1 ${tone}`}>
        <h3 className="folio flex items-center gap-1.5"><Icon size={14} strokeWidth={2} /> {label}</h3>
        <span className="mono text-[12px] text-ink-3">{list.length} takes</span>
      </div>
      {list.length ? list.map((p) => <PostCard key={p.id} post={p} hideStory />) : <p className="py-8 text-center text-[14px] text-ink-3">No takes on this side yet. Be the first.</p>}
    </div>
  );

  return (
    <div>
      {/* Phone toggle */}
      <div role="tablist" aria-label="Takes by stance" className="grid grid-cols-4 border-b border-rule lg:hidden">
        {tabs.map(([k, l, n, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[12px] font-bold ${tab === k ? "text-ink-1" : "text-ink-3"}`}>
            <span className="flex items-center gap-1"><Icon size={14} strokeWidth={2} />{l}</span><span className="mono text-[10.5px] font-normal">{n}</span>
            {tab === k && <span className={`absolute inset-x-2 bottom-0 h-[3px] ${k === "agree" ? "bg-agree" : k === "disagree" ? "bg-disagree" : k === "context" ? "bg-gold" : "bg-navy-ink"}`} />}
          </button>
        ))}
      </div>
      <div className="lg:hidden">
        {tab === "context" ? <div className="space-y-3 px-4 py-4">{context.map((p) => <ContextNote key={p.id} p={p} />)}{!context.length && <p className="py-8 text-center text-ink-3">No context notes yet.</p>}</div>
          : (tab === "agree" ? agree : tab === "disagree" ? disagree : questions).map((p) => <PostCard key={p.id} post={p} hideStory />)}
      </div>

      {/* Desktop: two columns + notes */}
      <div className="hidden lg:block">
        {context.length > 0 && <div className="mb-8 grid grid-cols-2 gap-4">{context.map((p) => <ContextNote key={p.id} p={p} />)}</div>}
        <div className="grid grid-cols-2 gap-10">
          {column("Agree", agree, "border-agree text-agree", AgreeIcon)}
          {column("Disagree", disagree, "border-disagree text-disagree", DisagreeIcon)}
        </div>
        {(questions.length > 0 || other.length > 0) && (
          <div className="mt-10 grid grid-cols-2 gap-10">
            {questions.length > 0 && column("Open questions", questions, "border-navy-ink text-navy-ink", QuestionIcon)}
            {other.length > 0 && column("Other takes", other, "border-rule-strong text-ink-2", ContextIcon)}
          </div>
        )}
      </div>
    </div>
  );
}
