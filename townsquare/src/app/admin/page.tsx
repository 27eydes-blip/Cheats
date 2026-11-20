import { notFound } from "next/navigation";
import { dailySeries, getBanner, recentActions, reportQueue, siteStats } from "@/lib/moderation";
import { requireViewerPage } from "@/lib/session";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmptyState } from "@/components/ui/States";
import { ShieldIcon } from "@/components/icons";
import { Time } from "@/components/Time";
import { BannerComposer, ReportCard } from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

const ACTION_TONE: Record<string, string> = {
  remove: "bg-danger", ban: "bg-breaking", suspend: "bg-danger", warn: "bg-warning", dismiss: "bg-ink-3", restore: "bg-success", unsuspend: "bg-success", verify: "bg-accent", unverify: "bg-ink-3",
};

export default async function Admin() {
  const admin = await requireViewerPage("/admin");
  if (admin.role !== "admin") notFound();
  const queue = reportQueue(admin.id);
  const stats = siteStats();
  const series = dailySeries(14);
  const banner = getBanner();
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const kpis = [
    { label: "Open reports", value: stats.openReports, series: series.reports, color: stats.openReports ? "var(--danger)" : "var(--success)", note: `${sum(series.reports)} filed in 14 days` },
    { label: "Posts, 24h", value: stats.posts24h, series: series.posts, color: "var(--accent)", note: `${sum(series.posts)} in 14 days` },
    { label: "Sign-ups, 24h", value: stats.signups24h, series: series.signups, color: "var(--accent-2)", note: `${stats.users} total accounts` },
    { label: "Mod actions", value: sum(series.actions), series: series.actions, color: "var(--warning)", note: `${stats.suspended} suspended now` },
  ];
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const g of queue) counts[g.severity]++;

  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold">Trust & Safety</Kicker>} title="Control Room" dek="Report queue, the Live Wire, and the health of the network." />
      <div role="note" className="mx-4 mt-6 mb-6 flex items-start gap-3 border-l-[3px] border-gold bg-gold-soft px-4 py-3 text-[14px] sm:mx-6">
        <ShieldIcon size={20} className="mt-0.5 shrink-0 text-gold-ink" />
        <p><b>The same rules apply to every account,</b> public figures and staff included. Act on what the content does, never on who posted it or which side it takes.</p>
      </div>

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-x-6 gap-y-6 px-4 sm:px-6 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="border-t-2 border-navy-ink pt-3">
            <p className="folio !text-[10px] text-ink-3">{k.label}</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="mono text-[34px] leading-none font-semibold">{k.value}</p>
              <Sparkline values={k.series} width={84} height={30} color={k.color} label={`${k.label}, last 14 days`} />
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">{k.note}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="queue" className="mt-7">
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 sm:px-6">
          <div>
            <h2 id="queue" className="font-display text-h1 font-semibold">Report queue</h2>
            <p className="text-[13.5px] text-ink-3">Sorted by severity, then by number of reports.</p>
          </div>
          <div className="flex gap-1.5 text-[12px] font-bold">
            {(["critical", "high", "medium", "low"] as const).map((s) => (
              <span key={s} className={`mono rounded-[2px] px-2 py-1 uppercase ${s === "critical" ? "bg-live-bg text-white" : s === "high" ? "bg-danger-soft text-disagree" : s === "medium" ? "bg-warning-bg text-warning" : "bg-paper-2 text-ink-2"}`}>
                {counts[s]} {s}
              </span>
            ))}
          </div>
        </div>
        {queue.length === 0 ? (
          <EmptyState art="done" title="Queue is clear" body="New reports land here, most severe first." />
        ) : (
          <div className="mt-3 space-y-3 px-4 sm:px-6">{queue.map((g) => <ReportCard key={`${g.targetType}:${g.targetId}`} group={g} />)}</div>
        )}
      </section>

      <section aria-labelledby="banner" className="mt-8 border-t border-line px-4 pt-6 sm:px-6">
        <h2 id="banner" className="font-display text-h1 font-semibold">Live Wire composer</h2>
        <p className="text-[13.5px] text-ink-3">The breaking item leads the Live Wire on every page. Link it to a live story (e.g. /news/story/infrastructure) or an outside article.</p>
        <BannerComposer current={banner} />
      </section>

      <section aria-labelledby="log" className="mt-8 border-t border-line px-4 pt-6 pb-8 sm:px-6">
        <h2 id="log" className="font-display text-h1 font-semibold">Moderation log</h2>
        <ol className="relative mt-4 border-l-2 border-line pl-5">
          {recentActions().map((a) => (
            <li key={a.id} className="relative pb-5 last:pb-0">
              <span aria-hidden="true" className={`absolute top-1.5 -left-[27px] h-3 w-3 rounded-full ring-4 ring-surface ${ACTION_TONE[a.action] ?? "bg-ink-3"}`} />
              <p className="text-[14.5px]">
                <b>@{a.mod_handle ?? "system"}</b> <span className="font-semibold uppercase tracking-wide text-[12px] text-ink-2">{a.action}</span> <b>@{a.user_handle ?? "deleted"}</b>
                {a.target_post_id && <> · <a className="text-accent hover:underline" href={`/p/${a.target_post_id}`}>post</a></>}
              </p>
              {a.note && <p className="mt-0.5 text-[14px] text-ink-2">“{a.note}”</p>}
              <p className="text-[12.5px] text-ink-3"><Time ms={a.created_at} /> ago</p>
            </li>
          ))}
          {recentActions().length === 0 && <li className="text-[14px] text-ink-3">No actions yet.</li>}
        </ol>
      </section>
    </Frame>
  );
}
