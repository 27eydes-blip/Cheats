import { liveEvents } from "@/lib/news";
import { LiveCard } from "@/components/live/LiveCard";
import { ScheduledRow } from "@/components/live/Scheduled";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Studio" };

export default function LiveStudio() {
  const events = liveEvents();
  const now = events.filter((e) => e.isLive);
  const later = events.filter((e) => !e.isLive);
  return (
    <Frame width="wide">
      <PageTitle folio={<Kicker tone="breaking">On air</Kicker>} title="Live Studio" dek="Shows, audio rooms, and debates. Go on air, or set a reminder." />
      {events.length === 0 && <EmptyState art="live" title="Dead air" body="Nothing is on right now. Scheduled shows appear here with a countdown." />}
      {now.length > 0 && (
        <section aria-labelledby="now" className="px-4 pt-6 sm:px-6">
          <h2 id="now" className="folio flex items-center gap-2 border-t-2 border-live-bg pt-3 text-live-bg dark:text-live"><span className="h-2 w-2 animate-live rounded-full bg-live" /> Now on air</h2>
          <div className="scrollbar-none mt-4 flex snap-x gap-4 overflow-x-auto sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3" data-no-swipe>
            {now.map((e) => <div key={e.id} className="w-[86%] shrink-0 snap-start sm:w-auto"><LiveCard e={e} /></div>)}
          </div>
        </section>
      )}
      {later.length > 0 && (
        <section aria-labelledby="later" className="mt-10 sm:px-2">
          <h2 id="later" className="folio mx-4 border-t border-[var(--wn-glass-border)] pt-3 text-[var(--wn-blue-ink)] sm:mx-4">Schedule</h2>
          <ul>{later.map((e) => <ScheduledRow key={e.id} e={e} />)}</ul>
        </section>
      )}
      <p className="mx-4 mt-8 border-l-2 border-rule-strong bg-paper-2 px-4 py-3 text-[12.5px] text-ink-3 sm:mx-6">
        Preview: live video and audio arrive in Stage 4. Schedules, reminders, and live chat work today.
      </p>
    </Frame>
  );
}
