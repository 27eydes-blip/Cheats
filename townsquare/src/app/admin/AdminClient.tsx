"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Banner, ModAction, ReportGroup } from "@/lib/moderation";
import { moderateAction, setBannerAction } from "@/actions/moderation";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/providers";
import { LocalDate } from "@/components/Time";

export function ReportCard({ group: g }: { group: ReportGroup }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [pending, start] = useTransition();
  const act = (action: ModAction) =>
    start(async () => {
      const r = await moderateAction({ targetType: g.targetType, targetId: g.targetId, action, note, suspendDays: days });
      toast(r.ok ? `Done: ${action}` : r.error, r.ok ? "ok" : "error");
      router.refresh();
    });
  const urgent = g.reasons.some((r) => ["sexual_minor", "threat", "doxxing", "self_harm"].includes(r.reason));
  return (
    <article className={`border-t border-line p-4 ${urgent ? "bg-danger/5" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-fg px-1.5 py-0.5 text-xs font-bold text-bg uppercase">{g.targetType}</span>
        {g.reasons.map((r) => (
          <span key={r.reason} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${urgent ? "bg-danger text-white" : "bg-surface"}`}>
            {r.label} ×{r.count}
          </span>
        ))}
        <span className="text-muted">first reported <LocalDate ms={g.firstAt} /></span>
      </div>
      {g.user && (
        <div className="mt-2 flex items-center gap-2">
          <Avatar url={g.user.avatarUrl} name={g.user.displayName} handle={g.user.handle} size={28} />
          <a href={`/u/${g.user.handle}`} className="font-semibold hover:underline">@{g.user.handle}</a>
          <span className="text-xs text-muted">status: {g.user.status} · prior strikes: {g.user.strikes}</span>
        </div>
      )}
      {g.post && (
        <blockquote className="mt-2 rounded-xl border border-line bg-bg p-3 text-[15px] whitespace-pre-wrap">
          {g.post.gone && <span className="mb-1 block text-xs font-bold text-danger uppercase">{g.post.gone}</span>}
          {g.post.body || <span className="text-muted">(no text)</span>}
          {g.post.media.length > 0 && <span className="mt-1 block text-xs text-muted">{g.post.media.length} image(s) — <a className="underline" href={`/p/${g.post.id}`}>open post</a></span>}
        </blockquote>
      )}
      {g.details.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-muted">
          {g.details.slice(0, 5).map((d, i) => <li key={i}>&ldquo;{d}&rdquo;</li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to user / log (optional)" aria-label="Moderator note" className="input min-w-48 flex-1 py-2" />
        {g.targetType === "post" && <button type="button" className="btn-danger min-h-10" disabled={pending} onClick={() => act("remove")}>Remove post</button>}
        <button type="button" className="btn-outline min-h-10" disabled={pending} onClick={() => act("warn")}>Warn</button>
        <span className="flex items-center gap-1">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Suspension length" className="input w-auto py-2">
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={0}>Permanent</option>
          </select>
          <button type="button" className="btn-outline min-h-10 border-danger text-danger" disabled={pending} onClick={() => act("suspend")}>Suspend</button>
        </span>
        <button type="button" className="btn-ghost min-h-10" disabled={pending} onClick={() => act("dismiss")}>Dismiss</button>
      </div>
    </article>
  );
}

export function BannerForm({ current }: { current: Banner | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 space-y-2"
      action={(fd) =>
        start(async () => {
          const r = await setBannerAction(fd);
          toast(r.ok ? "Banner updated" : r.error, r.ok ? "ok" : "error");
          router.refresh();
        })
      }
    >
      <input name="text" defaultValue={current?.text ?? ""} maxLength={140} placeholder="Headline shown across the top of every page" aria-label="Banner text" className="input" />
      <div className="flex flex-wrap gap-2">
        <input name="url" defaultValue={current?.url ?? ""} placeholder="Link (optional) https://…" aria-label="Banner link" className="input flex-1" />
        <select name="level" defaultValue={current?.level ?? "breaking"} aria-label="Banner style" className="input w-auto">
          <option value="breaking">Breaking (red)</option>
          <option value="alert">Alert (red)</option>
          <option value="info">Update (blue)</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>Publish banner</button>
        {current && <button name="clear" value="1" className="btn-outline" disabled={pending}>Clear banner</button>}
      </div>
    </form>
  );
}
