import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { listStories } from "@/lib/news";
import { breakingHistory, BREAKING_AUTO_SCORE } from "@/lib/push/news-alerts";
import { pushConfigured } from "@/lib/push/push";
import { get } from "@/lib/db";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { Time } from "@/components/Time";
import { BreakingComposer } from "./BreakingComposer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Breaking alerts" };

export default async function AlertsAdmin() {
  const admin = await requireViewerPage("/admin/alerts");
  if (admin.role !== "admin") notFound();
  const sent = new Set(breakingHistory(200).map((b) => b.story_key));
  const stories = listStories(25).map((s) => ({ key: s.key, title: s.title, importance: s.importance, outlets: s.outlets, sent: sent.has(s.key) }));
  const devices = get<{ n: number; u: number }>("SELECT count(*) n, count(DISTINCT user_id) u FROM push_subscriptions")!;
  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold"><Link href="/admin" className="hover:underline">Control Room</Link></Kicker>} title="Breaking alerts" dek="Send a push alert for a major story. Each story can be sent once, ever." />
      <p className="mx-4 mt-4 text-[14px] text-ink-2 sm:mx-6">
        {pushConfigured() ? <>{devices.u} people have alerts on, on {devices.n} devices.</> : <b>Push isn&apos;t configured: add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Railway.</b>}{" "}
        Stories scoring {BREAKING_AUTO_SCORE()}+ with 8+ outlets are sent automatically (at most one per sync, six a day). Each reader&apos;s quiet hours and daily limit still apply.
      </p>
      <BreakingComposer stories={stories} />
      <section aria-labelledby="hist" className="mx-4 mt-8 pb-10 sm:mx-6">
        <h2 id="hist" className="text-[17px] font-bold">Sent</h2>
        <ul className="mt-2 text-[14px]">
          {breakingHistory().map((b) => (
            <li key={b.story_key} className="border-b border-[var(--hairline)] py-2">
              <Link href={b.url} className="font-semibold hover:underline">{b.title}</Link>
              <span className="block text-[12.5px] text-ink-3"><Time ms={b.sent_at} /> ago · {b.auto ? "automatic" : `by @${b.handle ?? "editor"}`} · {b.recipients} people reached</span>
            </li>
          ))}
          {!breakingHistory().length && <li className="py-2 text-ink-3">No breaking alerts yet.</li>}
        </ul>
      </section>
    </Frame>
  );
}
