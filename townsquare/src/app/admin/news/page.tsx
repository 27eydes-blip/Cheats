import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { listSources, newsStatus } from "@/lib/newsroom/admin";
import { demoEnabled } from "@/lib/newsroom/settings";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { Time } from "@/components/Time";
import { AddFeed, DemoSwitch, SourceRowControls, SyncNow } from "./NewsAdmin";
import { OutletBadge } from "@/components/news/OutletBadge";

export const dynamic = "force-dynamic";
export const metadata = { title: "News feeds" };

export default async function NewsAdmin() {
  const admin = await requireViewerPage("/admin/news");
  if (admin.role !== "admin") notFound();
  const st = newsStatus();
  const sources = listSources();
  const failing = sources.filter((s) => s.active && s.error_count > 0);
  const active = sources.filter((s) => s.active).length;

  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold"><Link href="/admin" className="hover:underline">Control Room</Link></Kicker>} title="News feeds" dek="Where real headlines come from: outlets, feeds, lean ratings, sync status and errors." />

      <section aria-label="Sync status" className="mx-4 mt-6 grid gap-4 border-y border-[var(--hairline)] py-4 sm:mx-6 sm:grid-cols-4">
        <div><p className="text-[12.5px] text-ink-3">Last sync</p><p className="text-[16px] font-semibold">{st.last ? <><Time ms={st.last.started_at} /> ago</> : "Never"}</p>{st.last && <p className="text-[12.5px] text-ink-3">{st.last.new_items} new, {st.last.errors} errors ({st.last.trigger})</p>}</div>
        <div><p className="text-[12.5px] text-ink-3">Feeds</p><p className="text-[16px] font-semibold">{active} active</p><p className="text-[12.5px] text-ink-3">{failing.length} failing</p></div>
        <div><p className="text-[12.5px] text-ink-3">Stories</p><p className="text-[16px] font-semibold">{st.counts.real} real</p><p className="text-[12.5px] text-ink-3">{st.counts.items} articles stored</p></div>
        <div className="flex flex-col items-start gap-1.5"><SyncNow /><p className="text-[12.5px] text-ink-3">Runs by itself every {Number(process.env.NEWS_INGEST_INTERVAL_MIN) || 10} minutes.</p></div>
      </section>

      {!st.apiKey && (
        <p role="note" className="mx-4 mt-4 text-[13.5px] text-ink-2 sm:mx-6">
          <b>AP and Reuters</b> have no public feeds. Add a licensed news API key as <code className="mono">NEWS_API_KEY</code> in Railway to include them.
        </p>
      )}

      <section aria-labelledby="demo" className="mx-4 mt-6 sm:mx-6">
        <h2 id="demo" className="text-[17px] font-bold">Demo data</h2>
        <DemoSwitch on={demoEnabled()} allowed={st.demoAllowed} demoStories={st.counts.demo} />
      </section>

      <section aria-labelledby="add" className="mx-4 mt-8 sm:mx-6">
        <h2 id="add" className="text-[17px] font-bold">Add a feed</h2>
        <p className="mt-1 text-[13.5px] text-ink-3">Official RSS or Atom feeds only. We keep the headline, a snippet under 280 characters, the time and the link, and we check robots.txt before every fetch.</p>
        <AddFeed />
      </section>

      <section aria-labelledby="feeds" className="mt-8">
        <h2 id="feeds" className="mx-4 text-[17px] font-bold sm:mx-6">Outlets ({sources.length})</h2>
        <p className="mx-4 mt-1 text-[13.5px] text-ink-3 sm:mx-6">Lean labels are approximate, from public third-party ratings. Edit them here; the note says where each came from.</p>
        <ul className="mt-3 border-t border-[var(--hairline)]">
          {sources.map((s) => (
            <li key={s.id} className={`border-b border-[var(--hairline)] px-4 py-3 sm:px-6 ${s.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <OutletBadge name={s.name} color={s.color} className="text-[15px]" />
                <span className="text-[12.5px] text-ink-3">{s.outlet_type}{s.category ? ` · ${s.category}` : ""}{s.kind === "api" ? " · via news API" : ""}</span>
                <span className="ml-auto text-[12.5px] text-ink-3">
                  {!s.active ? "Paused" : s.last_success_at ? <>OK <Time ms={s.last_success_at} /> ago · {s.items_24h} new in 24h</> : "Not synced yet"}
                </span>
              </div>
              {s.last_error && <p className="mt-1 text-[13px] text-[var(--disagree)]">Error{s.error_count > 1 ? ` (${s.error_count} in a row)` : ""}: {s.last_error}{s.last_status ? ` · HTTP ${s.last_status}` : ""}</p>}
              <SourceRowControls id={s.id} name={s.name} lean={s.lean} note={s.lean_note} feedUrl={s.feed_url} active={!!s.active} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="runs" className="mx-4 mt-8 pb-10 sm:mx-6">
        <h2 id="runs" className="text-[17px] font-bold">Recent syncs</h2>
        <ul className="mt-2 text-[13.5px]">
          {st.recent.map((r) => (
            <li key={r.started_at} className="flex flex-wrap gap-x-3 border-b border-[var(--hairline)] py-2 text-ink-2">
              <span className="text-ink-1"><Time ms={r.started_at} /> ago</span>
              <span>{r.trigger}</span>
              <span>{r.new_items} new items</span>
              <span>{r.stories_new} new stories</span>
              <span className={r.errors ? "text-[var(--disagree)]" : ""}>{r.errors} errors</span>
              {!r.finished_at && <span>running…</span>}
            </li>
          ))}
          {!st.recent.length && <li className="py-2 text-ink-3">No syncs yet. The first runs about 15 seconds after the server starts.</li>}
        </ul>
      </section>
    </Frame>
  );
}
