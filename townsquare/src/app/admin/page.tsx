import { notFound } from "next/navigation";
import { getBanner, recentActions, reportQueue, siteStats } from "@/lib/moderation";
import { requireViewerPage } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { BannerForm, ReportCard } from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function Admin() {
  const admin = await requireViewerPage("/admin");
  if (admin.role !== "admin") notFound();
  const queue = reportQueue(admin.id);
  const stats = siteStats();
  const banner = getBanner();
  return (
    <>
      <PageHeader title="Admin" subtitle="Moderation queue and site controls" />
      <dl className="grid grid-cols-3 gap-2 border-b border-line p-4 text-center sm:grid-cols-5">
        {Object.entries({ "Open reports": stats.openReports, Users: stats.users, Suspended: stats.suspended, "Posts 24h": stats.posts24h, "Signups 24h": stats.signups24h }).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface p-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="text-xl font-black tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="border-b border-line p-4">
        <h2 className="text-lg font-extrabold">Breaking-news banner</h2>
        <BannerForm current={banner} />
      </section>

      <section>
        <h2 className="px-4 pt-4 text-lg font-extrabold">Report queue ({queue.length})</h2>
        <p className="px-4 pb-2 text-sm text-muted">Child safety, threats, and doxxing reports are sorted to the top. The same rules apply to every account.</p>
        {queue.length === 0 ? <p className="px-6 py-10 text-center text-muted">Queue is empty. 🎉</p> : queue.map((g) => <ReportCard key={`${g.targetType}:${g.targetId}`} group={g} />)}
      </section>

      <section className="border-t border-line p-4">
        <h2 className="text-lg font-extrabold">Recent moderation actions</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {recentActions().map((a) => (
            <li key={a.id}>
              <span className="text-muted">{new Date(a.created_at).toLocaleString()}</span> · <b>@{a.mod_handle ?? "system"}</b> {a.action} <b>@{a.user_handle}</b>
              {a.target_post_id && <> (<a className="text-accent underline" href={`/p/${a.target_post_id}`}>post</a>)</>}
              {a.note && <span className="text-muted"> — {a.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
