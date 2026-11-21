import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { abuseQueue } from "@/lib/notes/notes";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { Time } from "@/components/Time";
import { ReviewButtons } from "./ReviewButtons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Context notes review" };

export default async function NotesReview() {
  const admin = await requireViewerPage("/admin/notes");
  if (admin.role !== "admin") notFound();
  const q = abuseQueue();
  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold"><Link href="/admin" className="hover:underline">Control Room</Link></Kicker>} title="Context notes" dek="Notes people reported, raters moving unusually fast, and accounts whose notes keep getting rejected." />
      <section aria-labelledby="flagged" className="mt-6">
        <h2 id="flagged" className="mx-4 text-[17px] font-bold sm:mx-6">Reported notes ({q.flagged.length})</h2>
        <p className="mx-4 mt-1 text-[13.5px] text-ink-3 sm:mx-6">Notes with 3 or more open reports are hidden until you review them. Removing a note is final for that note; dismissing keeps it and clears the reports.</p>
        <ul className="mt-3 border-t border-[var(--hairline)]">
          {q.flagged.map((n) => (
            <li key={n.id} className="border-b border-[var(--hairline)] px-4 py-3 sm:px-6">
              <p className="text-[12.5px] text-ink-3">{n.reasons} · by @{n.author?.handle ?? "deleted"} · status {n.status}{n.hidden ? " · hidden" : ""}</p>
              <p className="mt-1 text-[15px]">{n.body}</p>
              <p className="mt-1 text-[12.5px]"><a href={n.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--wn-blue-ink)] underline">Source: {n.sourceDomain}</a> · <Link href={n.targetType === "story" ? `/news/story/${n.targetId}` : `/p/${n.targetId}`} className="underline">Open</Link></p>
              <ReviewButtons id={n.id} />
            </li>
          ))}
          {!q.flagged.length && <li className="px-4 py-4 text-[14px] text-ink-3 sm:px-6">Nothing reported.</li>}
        </ul>
      </section>
      <section aria-labelledby="fast" className="mx-4 mt-8 sm:mx-6">
        <h2 id="fast" className="text-[17px] font-bold">Fast raters (20+ ratings in the last hour)</h2>
        <ul className="mt-2 text-[14px]">{q.fastRaters.map((r) => <li key={r.handle} className="border-b border-[var(--hairline)] py-2"><Link href={`/u/${r.handle}`} className="underline">@{r.handle}</Link> · {r.n} ratings</li>)}{!q.fastRaters.length && <li className="py-2 text-ink-3">None.</li>}</ul>
      </section>
      <section aria-labelledby="bad" className="mx-4 mt-8 sm:mx-6">
        <h2 id="bad" className="text-[17px] font-bold">Authors with 3+ removed or rejected notes</h2>
        <ul className="mt-2 text-[14px]">{q.badAuthors.map((r) => <li key={r.handle} className="border-b border-[var(--hairline)] py-2"><Link href={`/u/${r.handle}`} className="underline">@{r.handle}</Link> · {r.removed} removed, {r.rejected} rated not helpful</li>)}{!q.badAuthors.length && <li className="py-2 text-ink-3">None.</li>}</ul>
      </section>
      <section aria-labelledby="recent" className="mx-4 mt-8 pb-10 sm:mx-6">
        <h2 id="recent" className="text-[17px] font-bold">Recent status changes</h2>
        <ul className="mt-2 text-[14px]">{q.recent.map((r) => <li key={r.id} className="border-b border-[var(--hairline)] py-2"><span className="text-ink-3"><Time ms={r.status_changed_at} /> ago · {r.status}</span> · <Link href={`/notes/${r.id}`} className="underline">{r.body.slice(0, 80)}</Link></li>)}{!q.recent.length && <li className="py-2 text-ink-3">No notes yet.</li>}</ul>
      </section>
    </Frame>
  );
}
