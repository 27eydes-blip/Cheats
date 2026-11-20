import { liveEvents } from "@/lib/news";
import { PageHeader } from "@/components/PageHeader";
import { LiveCard } from "@/components/live/LiveCard";
import { ScheduledRow } from "@/components/live/Scheduled";
import { Kicker } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live" };

export default function Live() {
  const events = liveEvents();
  const now = events.filter((e) => e.isLive);
  const later = events.filter((e) => !e.isLive);
  return (
    <>
      <PageHeader title="Live" kicker={<Kicker tone="breaking">On air</Kicker>} subtitle="Shows, audio rooms, and debates" />
      {events.length === 0 && <EmptyState art="live" title="Nothing on air right now" body="Scheduled shows appear here with a countdown." />}
      {now.length > 0 && (
        <section aria-labelledby="now" className="pb-2">
          <h2 id="now" className="flex items-center gap-2 px-4 pb-3 font-display text-h3 font-semibold sm:px-6">
            <span className="h-2.5 w-2.5 animate-live rounded-full bg-live" /> Live now
          </h2>
          <div className="scrollbar-none flex snap-x gap-3 overflow-x-auto px-4 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-6" data-no-swipe>
            {now.map((e) => <div key={e.id} className="w-[84%] shrink-0 snap-start sm:w-auto"><LiveCard e={e} /></div>)}
          </div>
        </section>
      )}
      {later.length > 0 && (
        <section aria-labelledby="later" className="mt-5 border-t border-line pt-5">
          <h2 id="later" className="px-4 font-display text-h3 font-semibold sm:px-6">Coming up</h2>
          <ul className="divide-y divide-line">{later.map((e) => <ScheduledRow key={e.id} e={e} />)}</ul>
        </section>
      )}
      <p className="mx-4 mt-6 rounded-[var(--r-md)] bg-surface-2 px-4 py-3 text-[12.5px] text-ink-3 sm:mx-6">
        Preview: live video and audio streaming arrive in Stage 4. Shows, schedules, reminders, and live chat work today.
      </p>
    </>
  );
}
