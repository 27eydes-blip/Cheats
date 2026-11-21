import Link from "next/link";
import { notFound } from "next/navigation";
import { getNote } from "@/lib/notes/notes";
import { MIN_PER_GROUP, MIN_RATINGS, PUBLISH_AT } from "@/lib/notes/bridging";
import { getViewer } from "@/lib/session";
import { Frame } from "@/components/ui/Frame";
import { PageHeader } from "@/components/PageHeader";
import { NoteCard } from "@/components/notes/NoteCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Why am I seeing this note?" };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const STATUS = { published: "Shown publicly", needs_ratings: "Waiting for more ratings", not_helpful: "Rated not helpful (hidden)", removed: "Removed by moderators" } as const;

export default async function NoteWhy({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const n = getNote((await params).id, viewer?.id ?? null);
  if (!n || n.status === "removed") notFound();
  const g = n.groups;
  const back = n.targetType === "story" ? `/news/story/${n.targetId}` : `/p/${n.targetId}`;
  return (
    <Frame>
      <PageHeader title="Why am I seeing this?" back compact />
      <div className="px-4 py-4">
        <NoteCard note={n} />
        <p className="mt-3 text-[14px]"><span className="text-ink-3">Status:</span> <b>{STATUS[n.status]}</b> · <Link href={back} className="text-[var(--wn-blue-ink)] underline">See what it&apos;s about</Link></p>

        <h2 className="mt-6 text-[17px] font-bold">How this note got here</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Anyone can write a context note, but it only shows to everyone when people who <b>usually disagree</b> with each other both rate it helpful. We look at how
          people have rated before (their past note ratings and agree/disagree stances) to find two broad viewpoint groups. Then a note needs at least {MIN_RATINGS} ratings,
          at least {MIN_PER_GROUP} from each group, and an average of {pct(PUBLISH_AT)} or more &ldquo;helpful&rdquo; in each group. A lot of votes from one side is not enough.
        </p>
        {g && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[14px]">
            {(["a", "b"] as const).map((k, i) => (
              <div key={k} className="rounded-[12px] px-3 py-2 ring-1 ring-[var(--hairline)]">
                <dt className="text-[12.5px] text-ink-3">Viewpoint group {i + 1}</dt>
                <dd><b>{g[k].n}</b> rating{g[k].n === 1 ? "" : "s"}, {g[k].n ? `${pct(g[k].avg)} helpful` : "none yet"}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-[13px] text-ink-3">
          {n.ratings} rating{n.ratings === 1 ? "" : "s"} in total. Ratings from brand-new accounts, and from people without enough rating history to place them in a group, are saved but don&apos;t count toward this test yet.
          A note can stop showing if later ratings change. The groups are not political labels we assign; they come only from rating patterns.
        </p>
        <p className="mt-4 text-[13px]"><Link href="/help#notes" className="text-[var(--wn-blue-ink)] underline">More about context notes</Link></p>
      </div>
    </Frame>
  );
}
