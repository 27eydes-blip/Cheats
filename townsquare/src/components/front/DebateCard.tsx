"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Debate } from "@/lib/takes";
import { stanceAction } from "@/actions/stance";
import { Avatar } from "../ui/Avatar";
import { VerifiedSeal } from "../ui/Badge";
import { CountdownRing } from "../ui/CountdownRing";
import { StanceChip } from "../ui/Stance";
import { useToast, useViewer } from "../providers";

function left(ms: number) {
  if (ms <= 0) return "Voting closed";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m left`;
}

/**
 * Head-to-head: a Take and the Answer that disagrees with it. Readers side
 * with one (an agree on that take, a disagree on the other) during a 24-hour
 * window; the bar shows the running result.
 */
export function DebateCard({ d, compact }: { d: Debate; compact?: boolean }) {
  const viewer = useViewer();
  const router = useRouter();
  const toast = useToast();
  const [votes, setVotes] = useState({ a: d.left.split.agree, b: d.right.split.agree });
  const [mine, setMine] = useState<"a" | "b" | null>(d.left.split.mine === "agree" ? "a" : d.right.split.mine === "agree" ? "b" : null);
  const [now, setNow] = useState<number | null>(null);
  const [, start] = useTransition();
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const total = votes.a + votes.b || 1;
  const pa = Math.round((votes.a / total) * 100);
  const closed = now !== null && now > d.endsAt;

  const side = (s: "a" | "b") => {
    if (!viewer) return router.push("/login");
    if (closed || mine === s) return;
    const prev = { votes, mine };
    setVotes({ a: votes.a + (s === "a" ? 1 : mine === "a" ? -1 : 0), b: votes.b + (s === "b" ? 1 : mine === "b" ? -1 : 0) });
    setMine(s);
    start(async () => {
      const [win, lose] = s === "a" ? [d.left, d.right] : [d.right, d.left];
      const r1 = await stanceAction("post", win.id, "agree");
      const r2 = await stanceAction("post", lose.id, "disagree");
      if (!r1.ok || !r2.ok) {
        setVotes(prev.votes);
        setMine(prev.mine);
        toast(!r1.ok ? r1.error : !r2.ok ? r2.error : "Couldn't vote", "error");
      } else setVotes({ a: (s === "a" ? r1 : r2).data.agree, b: (s === "a" ? r2 : r1).data.agree });
    });
  };

  const side_ = (p: Debate["left"], s: "a" | "b") => (
    <div className={`flex min-w-0 flex-col ${s === "b" ? "sm:items-end sm:text-right" : ""}`}>
      <Link href={`/u/${p.author.handle}`} className={`flex items-center gap-2.5 ${s === "b" ? "sm:flex-row-reverse" : ""}`}>
        <Avatar url={p.author.avatarUrl} name={p.author.displayName} handle={p.author.handle} size={compact ? 34 : 40} stance={p.stance === "agree" || p.stance === "disagree" ? p.stance : null} />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[14px] font-semibold">{p.author.displayName}{p.author.verified && <VerifiedSeal size={13} />}</span>
          {p.stance && <StanceChip stance={p.stance} />}
        </span>
      </Link>
      <p className={`mt-2 font-display leading-snug ${compact ? "line-clamp-3 text-[16px]" : "text-[19px]"}`}>“{p.body.replace(/\s*#\w+\s*$/, "")}”</p>
    </div>
  );

  return (
    <div className="bg-paper-2 p-4 sm:p-5">
      {d.story && <Link href={`/news/story/${d.story.key}`} className="folio mb-3 block !text-[10px] text-gold-ink hover:underline">On: {d.story.title}</Link>}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        {side_(d.left, "a")}
        <span className="mono hidden self-center px-1 text-[13px] font-bold text-ink-3 sm:block">VS</span>
        {side_(d.right, "b")}
      </div>
      <div className="mt-4">
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-[2px]" aria-hidden="true">
          <span className="bg-navy transition-[width] duration-700 ease-[var(--ease-spring)] dark:bg-navy-ink" style={{ width: `${pa}%` }} />
          <span className="flex-1 bg-gold" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={() => side("a")} aria-pressed={mine === "a"} disabled={closed} className={`btn !min-h-9 !px-3 !text-[12.5px] ${mine === "a" ? "bg-navy text-white" : "ring-1 ring-rule"}`}>
            <span className="mono">{pa}%</span> Side with {d.left.author.displayName.split(" ")[0]}
          </button>
          <span className="mono hidden items-center gap-1.5 text-[11px] text-ink-3 sm:flex" suppressHydrationWarning>
            {now !== null && <CountdownRing progress={Math.max(0, (d.endsAt - now) / 86_400_000)} size={14} stroke={2} color="var(--gold)" />}
            {now !== null ? left(d.endsAt - now) : ""}
          </span>
          <button type="button" onClick={() => side("b")} aria-pressed={mine === "b"} disabled={closed} className={`btn !min-h-9 !px-3 !text-[12.5px] ${mine === "b" ? "bg-gold text-navy" : "ring-1 ring-rule"}`}>
            Side with {d.right.author.displayName.split(" ")[0]} <span className="mono">{100 - pa}%</span>
          </button>
        </div>
      </div>
      <Link href={`/p/${d.left.id}`} className="folio mt-3 block text-center !text-[10px] text-ink-3 hover:text-navy-ink">Read the full exchange →</Link>
    </div>
  );
}
