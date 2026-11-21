import type { CoverageItem } from "@/lib/news";
import { LEANS } from "@/lib/newsroom/outlets";
import { Time } from "../Time";
import { OutletBadge } from "./OutletBadge";

const GROUPS = [...LEANS, null] as const;

/** Every outlet covering a story, grouped by lean, each linking to its own article. */
export function CoverageList({ items }: { items: CoverageItem[] }) {
  // One row per outlet: its latest article on the story.
  const byOutlet = new Map<string, CoverageItem>();
  for (const it of items) if (!byOutlet.has(it.sourceId)) byOutlet.set(it.sourceId, it);
  const outlets = [...byOutlet.values()];
  return (
    <div className="space-y-4">
      {GROUPS.map((lean) => {
        const list = outlets.filter((o) => o.lean === lean);
        if (!list.length) return null;
        return (
          <section key={lean ?? "unrated"} aria-label={`${lean ?? "Not rated"} outlets`}>
            <h3 className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-1 text-[12.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase">
              <span>{lean ?? "Not rated"}</span>
              <span className="font-normal normal-case">{list.length} outlet{list.length === 1 ? "" : "s"}</span>
            </h3>
            <ul>
              {list.map((o) => (
                <li key={o.sourceId}>
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="group block py-2">
                    <span className="flex min-w-0 items-center gap-2 text-[13px]">
                      <OutletBadge name={o.source} color={o.color} />
                      {o.opinion && <span className="shrink-0 rounded-[4px] px-1 text-[11px] text-ink-3 ring-1 ring-[var(--hairline)]">Opinion</span>}
                      <span className="ml-auto shrink-0 text-[12.5px] text-ink-3"><Time ms={o.publishedAt} /></span>
                    </span>
                    <span className="mt-0.5 block text-[14.5px] leading-snug text-ink-1 group-hover:underline">{o.title} <span aria-hidden="true" className="text-ink-3">↗</span><span className="sr-only">(opens {o.source})</span></span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-[12.5px] leading-snug text-ink-3">
        Lean labels are approximate, based on public third-party ratings (AllSides, Ad Fontes Media). Headlines link to each outlet&apos;s own article. <a href="/help#coverage" className="text-[var(--wn-blue-ink)] underline">How this works</a>
      </p>
    </div>
  );
}
