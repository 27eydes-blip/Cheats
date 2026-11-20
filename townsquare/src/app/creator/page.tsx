import Link from "next/link";
import { earnedAchievements, postingStreak } from "@/lib/achievements";
import { creatorStats } from "@/lib/creator";
import { credibilityScore } from "@/lib/credibility";
import { requireViewerPage } from "@/lib/session";
import { Time } from "@/components/Time";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Hub" };

/** Creator Hub: your reach over the last 28 days and what landed best. */
export default async function CreatorHub() {
  const viewer = await requireViewerPage("/creator");
  const s = creatorStats(viewer.id);
  const cred = credibilityScore(viewer.id);
  const streak = postingStreak(viewer.id);
  const badges = earnedAchievements(viewer.id);
  const tiles: [string, number | string, string][] = [
    ["Dispatches", s.dispatches, "filed"],
    ["Views", s.views, "in feeds"],
    ["Reactions", s.reactionsIn, "received"],
    ["Responses", s.responsesIn, "received"],
    ["Relays", s.relaysIn, "of your dispatches"],
    ["New followers", s.newFollowers, "gained"],
    ["Credibility", cred.score, cred.level],
    ["Streak", streak ? `${streak}d` : "0", streak ? "keep it going" : "post today to start"],
  ];
  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold">Last {s.days} days</Kicker>} title="Creator Hub" dek="How your dispatches are doing, and what to do more of." />
      <dl className="grid grid-cols-2 gap-3 px-3 pt-4 sm:grid-cols-4 sm:px-4">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="card p-4">
            <dt className="text-[11px] font-extrabold tracking-[0.12em] text-ink-3 uppercase">{label}</dt>
            <dd className="mt-1 font-display text-[34px] leading-none font-extrabold">{typeof value === "number" ? value.toLocaleString("en-US") : value}</dd>
            <dd className="mt-1 text-[12px] text-ink-3">{hint}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="top" className="px-3 pt-6 sm:px-4">
        <h2 id="top" className="mb-2 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">Top dispatches</h2>
        {s.top.length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-[15px] text-ink-2">Nothing filed in the last {s.days} days. A good first one: pick a story, take a side, and add a source link.</p>
            <Link href="/" className="btn-primary mt-3">Find a story</Link>
          </div>
        ) : (
          <ol className="space-y-2">
            {s.top.map((p, i) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}`} className="card card-hover flex gap-3 p-3.5">
                  <span className="font-display text-[30px] leading-none font-extrabold text-[var(--wn-blue)]">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px]">{p.body || "(photo dispatch)"}</span>
                    <span className="mono mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] text-ink-3"><span>{p.views} VIEWS</span><span>{p.reactions} REACTIONS</span><span>{p.responses} RESPONSES</span><span>{p.relays} RELAYS</span><span><Time ms={p.createdAt} /> AGO</span></span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section aria-labelledby="tips" className="px-3 pt-6 sm:px-4">
        <h2 id="tips" className="mb-2 font-display text-[22px] font-extrabold tracking-[0.03em] uppercase">Raise your reach</h2>
        <ul className="card divide-y divide-rule">
          {[
            [cred.dispatches > cred.sourced, "Add a source link", "Sourced dispatches raise your Credibility, which readers see on your profile."],
            [streak < 3, "Post three days in a row", "A streak earns a badge and keeps you in your followers' Friends feed."],
            [badges.length < 3, "React and respond", "People you engage with are the most likely to follow you back."],
            [true, "Take a stance on a live story", "Dispatches attached to a story appear on its page and in topic tabs."],
          ].filter(([show]) => show).map(([, title, text]) => (
            <li key={String(title)} className="px-4 py-3"><p className="font-bold">{title}</p><p className="text-[13.5px] text-ink-3">{text}</p></li>
          ))}
        </ul>
      </section>
    </Frame>
  );
}
