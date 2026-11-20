import { listStories } from "@/lib/news";
import { StoryArt } from "@/components/front/StoryArt";
import { LiveBadge } from "@/components/ui/Badge";
import { MiniSplit } from "@/components/ui/Stance";

/** A live, read-only slice of today's Front Page, shown beside sign-up and log-in. */
export function SamplePage() {
  const [lead, ...rest] = listStories(5);
  if (!lead) return null;
  return (
    <div aria-label="Today's front page (sample)" className="border border-rule bg-paper p-4 sm:p-6">
      <div className="flex items-center justify-between border-b-[3px] border-navy-ink pb-2">
        <span className="font-display text-[22px] font-semibold text-navy-ink">Today&apos;s Front Page</span>
        <span className="folio !text-[9.5px] text-ink-3">Preview</span>
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="aspect-[16/10] overflow-hidden"><StoryArt seed={lead.key} section={lead.section} photo={lead.photo} /></div>
          <div className="mt-3">{lead.status === "live" && <LiveBadge label="LIVE" />}</div>
          <p className="mt-1.5 font-display text-[24px] leading-tight font-semibold">{lead.title}</p>
          <MiniSplit split={lead.split} className="mt-3" />
        </div>
        <ul className="divide-y divide-rule">
          {rest.map((s) => (
            <li key={s.key} className="py-2.5 first:pt-0">
              <p className="folio !text-[9.5px] text-ink-3">{s.section === "Top Stories" ? "National" : s.section}</p>
              <p className="font-display text-[16px] leading-snug font-semibold">{s.title}</p>
              <MiniSplit split={s.split} className="mt-1.5" />
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 border-t border-rule pt-3 text-[13px] text-ink-3">Every story has a split. Pick a side, write a take, and see who answers.</p>
    </div>
  );
}
