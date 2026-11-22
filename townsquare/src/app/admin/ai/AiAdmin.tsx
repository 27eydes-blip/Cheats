"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { aiAccountAction, aiApprovalModeAction, aiAvatarAction, aiDecisionAction, aiKillSwitchAction, aiRunNowAction } from "@/actions/ai";
import type { AiLogRow, AiSettings } from "@/lib/ai/newsroom";
import { FORMAT_LABEL } from "@/lib/ai/meta";
import { useToast } from "@/components/providers";
import { useConfirm } from "@/components/ui/Confirm";
import { Avatar } from "@/components/ui/Avatar";
import { AiBadge } from "@/components/ui/Badge";

type Account = {
  id: string; slug: string; handle: string; name: string; niche: string; style: string; defaultStyle: string; paused: boolean; hours: string; maxPerHour: number; avatar: string;
  lastRun: { slot: string; outcome: string; note: string } | null;
};
type Status = { hasKey: boolean; model: string; caps: { daily: number; monthly: number }; spend: { today: number; month: number; total: number }; perPost: number; timezone: string; schedulerOff: boolean };

const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
const when = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const STATUS_STYLE: Record<string, string> = {
  posted: "bg-[rgb(34_197_94/0.16)] text-[#4ade80] ring-[#4ade80]/30",
  queued: "bg-[rgb(47_107_255/0.18)] text-[var(--wn-blue-ink)] ring-[var(--wn-blue-ink)]/30",
  blocked: "bg-danger-soft text-disagree ring-disagree/30",
  error: "bg-danger-soft text-disagree ring-disagree/30",
  held: "bg-warning-bg text-warning ring-warning/30",
};
function Chip({ s }: { s: string }) {
  return <span className={`inline-flex items-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold tracking-[0.08em] uppercase ring-1 ${STATUS_STYLE[s] ?? "bg-paper-2 text-ink-2 ring-rule"}`}>{s}</span>;
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 ring-1 ring-[var(--hairline)] transition-all before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-[var(--wn-blue-fill)] checked:before:translate-x-[22px] disabled:opacity-50" />;
}

function useAct() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, ok?: string | ((d: T) => string)) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error, "error");
      if (ok) toast(typeof ok === "function" ? ok(r.data) : ok);
      router.refresh();
    });
  return { pending, act };
}

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div>
      <p className="flex justify-between text-[13px]"><span className="text-ink-2">{label}</span><span className="mono text-ink-1">{usd(used)} {cap ? `of ${usd(cap)}` : "(no cap set)"}</span></p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={`${label} spending`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-[var(--disagree)]" : "bg-[var(--wn-blue-fill)]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Sources({ row }: { row: AiLogRow }) {
  if (!row.sources.length) return null;
  return (
    <details className="mt-1.5 text-[13px]">
      <summary className="tap inline-flex min-h-8 cursor-pointer items-center text-ink-2 hover:text-ink-1">Sources ({row.sources.length})</summary>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-ink-2">
        {row.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--wn-blue-ink)] hover:underline"><b>{s.outlet}</b>{s.lean ? ` (${s.lean})` : ""}: {s.title}</a>
            {s.snippet && <span className="block text-[12.5px] text-ink-3">{s.snippet}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Verification({ row }: { row: AiLogRow }) {
  const v = row.verification;
  if (!v || (v.pass === undefined && !v.checks?.length)) return null;
  const problems = [...(v.checks ?? []), ...(v.unsupported ?? []).map((c) => `Unsupported: ${c}`)];
  return (
    <p className="mt-1 text-[12.5px] text-ink-3">
      Verification: {v.pass && !problems.length ? <span className="font-semibold text-[#4ade80]">passed</span> : <span className="font-semibold text-disagree">failed</span>}
      {problems.length > 0 && <> · {problems.join(" · ")}</>}
      {v.notes ? <> · {v.notes}</> : null}
    </p>
  );
}

function LogRow({ row, queue }: { row: AiLogRow; queue?: boolean }) {
  const { pending, act } = useAct();
  const confirm = useConfirm();
  return (
    <li className="py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
        <Chip s={row.status} />
        <Link href={`/u/${row.handle}`} className="font-semibold text-ink-1 hover:underline">@{row.handle}</Link>
        <span>{FORMAT_LABEL[row.format] ?? row.format}</span>
        <span className="mono">{when(row.created_at)}</span>
        {row.cost_usd > 0 && <span className="mono">{usd(row.cost_usd)}</span>}
      </p>
      {row.story_title && <p className="mt-1 text-[13.5px] text-ink-2">Story: {row.story_key ? <Link href={`/news/story/${row.story_key}`} className="hover:underline">{row.story_title}</Link> : row.story_title}</p>}
      {row.body && <p className="mt-1 text-[15px] leading-snug text-ink-1">{row.body}</p>}
      {row.reason && <p className="mt-1 text-[13px] text-ink-2">{row.reason}</p>}
      <Verification row={row} />
      <Sources row={row} />
      <div className="mt-2 flex flex-wrap gap-2">
        {queue && (
          <>
            <button type="button" className="btn-primary !min-h-10 !text-[14px]" disabled={pending} onClick={() => act(() => aiDecisionAction(row.id, "approve"), "Published")}>Approve and post</button>
            <button type="button" className="btn-outline !min-h-10 !text-[14px]" disabled={pending} onClick={() => act(() => aiDecisionAction(row.id, "reject"), "Rejected")}>Reject</button>
          </>
        )}
        {row.status === "posted" && (
          <>
            {row.post_id && <Link href={`/p/${row.post_id}`} className="btn-outline !min-h-10 !text-[14px]">View post</Link>}
            <button
              type="button"
              className="btn-danger !min-h-10 !text-[14px]"
              disabled={pending}
              onClick={async () => {
                if (await confirm({ title: "Delete this AI post?", body: "It disappears from feeds. The log keeps the record.", confirm: "Delete", danger: true })) act(() => aiDecisionAction(row.id, "delete"), "Deleted");
              }}
            >
              Delete post
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function AccountRow({ a, timezone }: { a: Account; timezone: string }) {
  const { pending, act } = useAct();
  const [style, setStyle] = useState(a.style);
  const [hours, setHours] = useState(a.hours);
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <Avatar url={a.avatar} name={a.name} handle={a.handle} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink-1"><Link href={`/u/${a.handle}`} className="hover:underline">{a.name}</Link> <AiBadge /> <span className="text-[13px] font-normal text-ink-3">@{a.handle}</span></p>
          <p className="text-[13.5px] text-ink-2">{a.niche}</p>
          <p className="text-[12.5px] text-ink-3">{a.lastRun ? <>Last run {a.lastRun.slot.replace("T", " ")}:00 UTC · {a.lastRun.outcome.replace("_", " ")}{a.lastRun.note ? ` · ${a.lastRun.note}` : ""}</> : "Has not run yet."}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-ink-2">
          {a.paused ? "Paused" : "Active"}
          <Switch checked={!a.paused} label={`${a.name} active`} disabled={pending} onChange={(on) => act(() => aiAccountAction(a.id, { paused: !on }), on ? `${a.name} resumed` : `${a.name} paused`)} />
        </label>
      </div>
      <details className="mt-2 pl-[56px]">
        <summary className="tap inline-flex min-h-9 cursor-pointer items-center text-[13.5px] font-semibold text-[var(--wn-blue-ink)]">Style guide, hours and portrait</summary>
        <div className="mt-2 space-y-3">
          <label className="block text-[13px] text-ink-2">
            Style guide (the account&apos;s voice; the grounding rules always apply on top)
            <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={4} maxLength={1500} className="input mt-1 w-full" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary !min-h-10 !text-[14px]" disabled={pending || style === a.style} onClick={() => act(() => aiAccountAction(a.id, { style }), "Style guide saved")}>Save style guide</button>
            {style !== a.defaultStyle && <button type="button" className="btn-outline !min-h-10 !text-[14px]" onClick={() => setStyle(a.defaultStyle)}>Reset to default</button>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[13px] text-ink-2">
              Posting hours ({timezone}): all, 6-22, or 8,12,18
              <input value={hours} onChange={(e) => setHours(e.target.value)} className="input mt-1 block w-48" />
            </label>
            <button type="button" className="btn-outline !min-h-10 !text-[14px]" disabled={pending || hours === a.hours} onClick={() => act(() => aiAccountAction(a.id, { hours }), "Hours saved")}>Save hours</button>
            <label className="text-[13px] text-ink-2">
              Posts per hour
              <select value={a.maxPerHour} onChange={(e) => act(() => aiAccountAction(a.id, { maxPerHour: Number(e.target.value) }), "Saved")} className="input mt-1 block">
                <option value={1}>Up to 1</option>
                <option value={2}>Up to 2</option>
              </select>
            </label>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("handle", a.handle);
              act(() => aiAvatarAction(fd), "Portrait updated");
            }}
          >
            <label className="text-[13px] text-ink-2">
              Portrait (a generated image of an invented person; JPG, PNG or WebP up to 5 MB)
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="mt-1 block text-[13px]" />
            </label>
            <button type="submit" className="btn-outline !min-h-10 !text-[14px]" disabled={pending}>Upload</button>
            <button type="button" className="btn-outline !min-h-10 !text-[14px]" disabled={pending} onClick={() => { const fd = new FormData(); fd.set("handle", a.handle); fd.set("clear", "1"); act(() => aiAvatarAction(fd), "Back to the illustrated portrait"); }}>Use illustration</button>
          </form>
        </div>
      </details>
    </li>
  );
}

export function AiAdmin({ settings, status, counts, accounts, queue, log, filter, filters }: { settings: AiSettings; status: Status; counts: Record<string, number>; accounts: Account[]; queue: AiLogRow[]; log: AiLogRow[]; filter: string; filters: string[] }) {
  const { pending, act } = useAct();
  const confirm = useConfirm();
  const ready = status.hasKey && status.caps.daily > 0 && status.caps.monthly > 0;
  return (
    <div className="space-y-8 px-4 pt-5 pb-12 sm:px-6">
      <section aria-labelledby="h-switch" className={`rounded-[14px] p-4 ring-1 ${settings.enabled ? "bg-[rgb(34_197_94/0.08)] ring-[#4ade80]/30" : "bg-white/[0.03] ring-[var(--hairline)]"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="h-switch" className="text-[18px] font-bold text-ink-1">AI newsroom is {settings.enabled ? "ON" : "OFF"}</h2>
            <p className="mt-1 text-[14px] text-ink-2">{settings.enabled ? "Accounts post on the hour, within the caps below." : "Global kill switch. While it is off nothing is written, posted or paid for."}</p>
          </div>
          <Switch
            checked={settings.enabled}
            label="AI newsroom on"
            disabled={pending}
            onChange={async (on) => {
              if (on && !(await confirm({ title: "Turn the AI newsroom on?", body: ready ? `Accounts will start posting within the hour and spend up to ${usd(status.caps.daily)} a day.` : "The API key or the spending caps are missing, so nothing will run until they are added in Railway.", confirm: "Turn on" }))) return;
              act(() => aiKillSwitchAction(on), on ? "AI newsroom on" : "AI newsroom off");
            }}
          />
        </div>
        <ul className="mt-3 space-y-1 text-[13.5px]">
          <li>{status.hasKey ? "✓" : "✗"} ANTHROPIC_API_KEY {status.hasKey ? "is set" : "is not set (add it in Railway → Variables)"}</li>
          <li>{status.caps.daily && status.caps.monthly ? "✓" : "✗"} Spending caps: {status.caps.daily ? `${usd(status.caps.daily)} a day` : "AI_DAILY_CAP_USD not set"}, {status.caps.monthly ? `${usd(status.caps.monthly)} a month` : "AI_MONTHLY_CAP_USD not set"}</li>
          <li className="text-ink-3">Model {status.model} · about {usd(status.perPost)} per dispatch at most (draft and check) · hours in {status.timezone}{status.schedulerOff ? " · scheduler disabled by AI_NEWSROOM=off" : ""}</li>
        </ul>
        <fieldset className="mt-4">
          <legend className="text-[13.5px] font-semibold text-ink-1">Publishing</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(["auto", "manual"] as const).map((m) => (
              <label key={m} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[14px] ring-1 ${settings.approval === m ? "bg-[rgb(47_107_255/0.16)] ring-[var(--wn-blue-ink)]/40" : "ring-[var(--hairline)]"}`}>
                <input type="radio" name="approval" checked={settings.approval === m} disabled={pending} onChange={() => act(() => aiApprovalModeAction(m), "Saved")} />
                {m === "auto" ? "Auto-post after verification" : "Hold every post for my approval"}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="btn-outline mt-4 !min-h-10 !text-[14px]" disabled={pending || !settings.enabled} onClick={() => act(() => aiRunNowAction(), (msg: string) => msg)}>Run this hour now</button>
      </section>

      <section aria-labelledby="h-spend" className="space-y-3">
        <h2 id="h-spend" className="text-[18px] font-bold text-ink-1">Spending</h2>
        <Meter label="Today (UTC)" used={status.spend.today} cap={status.caps.daily} />
        <Meter label="This month" used={status.spend.month} cap={status.caps.monthly} />
        <p className="text-[13px] text-ink-3">All time {usd(status.spend.total)} · {counts.posted ?? 0} posted · {counts.blocked ?? 0} blocked · {counts.held ?? 0} held · {counts.skipped ?? 0} skipped · {counts.error ?? 0} errors</p>
      </section>

      <section aria-labelledby="h-queue">
        <h2 id="h-queue" className="text-[18px] font-bold text-ink-1">Approval queue {queue.length > 0 && <span className="text-ink-3">({queue.length})</span>}</h2>
        {queue.length ? <ul className="divide-y divide-[var(--hairline)]">{queue.map((r) => <LogRow key={r.id} row={r} queue />)}</ul> : <p className="mt-1 text-[14px] text-ink-3">{settings.approval === "manual" ? "Nothing waiting." : "Posts publish automatically after verification. Switch to manual approval above to review them first."}</p>}
      </section>

      <section aria-labelledby="h-accounts">
        <h2 id="h-accounts" className="text-[18px] font-bold text-ink-1">Accounts</h2>
        <ul className="divide-y divide-[var(--hairline)]">{accounts.map((a) => <AccountRow key={a.id} a={a} timezone={status.timezone} />)}</ul>
      </section>

      <section aria-labelledby="h-log">
        <h2 id="h-log" className="text-[18px] font-bold text-ink-1">Generation log</h2>
        <p className="text-[13.5px] text-ink-3">Every draft, with its sources and the verification result. Blocked posts never appeared on the site.</p>
        <nav aria-label="Filter the log" className="mt-2 flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link key={f} href={f === "all" ? "/admin/ai" : `/admin/ai?log=${f}`} aria-current={f === filter ? "page" : undefined} className={`tap inline-flex min-h-9 items-center rounded-full px-3 text-[13px] font-semibold ring-1 ${f === filter ? "bg-[var(--wn-blue-fill)] text-white ring-transparent" : "text-ink-2 ring-[var(--hairline)] hover:text-ink-1"}`}>
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}{f !== "all" && counts[f] ? ` ${counts[f]}` : ""}
            </Link>
          ))}
        </nav>
        {log.length ? <ul className="divide-y divide-[var(--hairline)]">{log.map((r) => <LogRow key={r.id} row={r} />)}</ul> : <p className="mt-2 text-[14px] text-ink-3">Nothing here yet.</p>}
      </section>
    </div>
  );
}
