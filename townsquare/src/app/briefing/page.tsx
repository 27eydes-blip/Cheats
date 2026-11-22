import Link from "next/link";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { debates } from "@/lib/takes";
import { DebateCard } from "@/components/front/DebateCard";
import { StoryArt } from "@/components/front/StoryArt";
import { Kicker, LiveBadge } from "@/components/ui/Badge";
import { Wordmark } from "@/components/ui/Logo";
import { MiniSplit } from "@/components/ui/Stance";
import { SaveOffline } from "./SaveOffline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Morning Edition" };

/** Morning Edition: ten stories, three debates, a reading time, and an offline copy. */
export default async function Briefing() {
  const viewer = await getViewer();
  const stories = listStories(10, { viewerId: viewer?.id ?? null });
  const fights = debates(viewer?.id ?? null, 3);
  const words = stories.reduce((n, s) => n + s.title.split(" ").length + s.summary.split(" ").length, 0) + fights.length * 90;
  const minutes = Math.max(3, Math.round(words / 200));
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const [lead, ...rest] = stories;
  return (
    <div className="mx-auto max-w-[1040px] px-4 pt-8 sm:px-6 lg:pt-12">
      <header className="text-center">
        <p className="folio text-gold-ink">Morning Edition</p>
        <div className="mt-2"><Wordmark size="lg" /></div>
        <div aria-hidden="true" className="double-rule mt-4" />
        <div className="mono mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-3 uppercase">
          <span suppressHydrationWarning>{date}</span>
          <span>National · {stories.length} stories · {fights.length} debates · {minutes} min read</span>
          <SaveOffline />
        </div>
        <div className="mt-2 border-t border-rule" />
      </header>

      {lead && (
        <Link href={`/news/story/${lead.key}`} className="group mt-8 grid gap-6 md:grid-cols-2">
          <div className="aspect-[4/3] overflow-hidden"><StoryArt seed={lead.key} section={lead.section} photo={lead.photo} /></div>
          <div>
            <span className="flex items-center gap-2">{lead.status === "live" && <LiveBadge label="LIVE" />}<Kicker tone="muted">{lead.section === "Top Stories" ? "U.S." : lead.section}</Kicker></span>
            <h1 className="mt-2 font-display text-display font-semibold text-balance group-hover:underline">{lead.title}</h1>
            <p className="drop-cap mt-4 text-[17px] leading-relaxed text-ink-2">{lead.summary}</p>
            <MiniSplit split={lead.split} className="mt-4" />
          </div>
        </Link>
      )}

      <section aria-label="The rest of the edition" className="mt-10 columns-1 gap-8 border-t border-[var(--wn-glass-border)] pt-6 md:columns-2 lg:columns-3 [column-rule:1px_solid_var(--rule)]">
        {rest.map((s, i) => (
          <Link key={s.key} href={`/news/story/${s.key}`} className="group mb-6 block break-inside-avoid">
            <span className="mono text-[11px] text-gold-ink">{String(i + 2).padStart(2, "0")}</span>
            <Kicker tone="muted" className="ml-2">{s.section === "Top Stories" ? "U.S." : s.section}</Kicker>
            <h2 className="mt-1 font-display text-[21px] leading-snug font-semibold group-hover:underline">{s.title}</h2>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{s.summary}</p>
            <MiniSplit split={s.split} className="mt-2" />
          </Link>
        ))}
      </section>

      {fights.length > 0 && (
        <section aria-labelledby="debates" className="mt-6 border-t border-[var(--wn-glass-border)] pt-6">
          <h2 id="debates" className="folio text-navy-ink">Three debates worth settling</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-3">{fights.map((d) => <DebateCard key={d.left.id} d={d} compact />)}</div>
        </section>
      )}
      <p className="mt-10 border-t border-rule pt-4 pb-6 text-center font-display text-[19px] font-bold tracking-[0.04em] text-ink-3 uppercase">That&apos;s the edition. Go have a good day.</p>
    </div>
  );
}
