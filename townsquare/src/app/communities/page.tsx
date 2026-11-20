import Link from "next/link";
import { listCommunities } from "@/lib/communities";
import { getViewer } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { CommunityArt, CommunityIconTile } from "@/components/community/CommunityArt";
import { JoinButton } from "@/components/community/JoinButton";
import { Kicker } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Communities" };

export default async function Communities() {
  const viewer = await getViewer();
  const list = listCommunities(viewer?.id ?? null);
  const mine = list.filter((c) => c.joined);
  const [featured, ...rest] = list;
  return (
    <>
      <PageHeader title="Communities" subtitle="Topic groups with voting and threaded discussion" kicker={<Kicker>Groups</Kicker>} />
      {mine.length > 0 && (
        <section aria-labelledby="mine" className="pb-2">
          <h2 id="mine" className="kicker px-4 pt-1 pb-2 text-ink-3 sm:px-6">Your communities</h2>
          <ul className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
            {mine.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
                  <CommunityIconTile slug={c.slug} name={c.name} size={60} />
                  <span className="line-clamp-1 text-[12.5px] font-semibold">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {featured && (
        <Link href={`/c/${featured.slug}`} className="group mx-4 mb-4 block overflow-hidden rounded-[var(--r-xl)] ring-1 ring-line sm:mx-6">
          <div className="relative aspect-[2.4/1]">
            <CommunityArt slug={featured.slug} className="transition-transform duration-700 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-5">
              <div className="min-w-0">
                <span className="kicker text-white/80">Most active</span>
                <h2 className="font-display text-h2 font-semibold">{featured.name}</h2>
                <p className="num text-[13px] text-white/80">{featured.members.toLocaleString("en-US")} members · {featured.postsThisWeek} posts this week</p>
              </div>
              <JoinButton communityId={featured.id} joined={featured.joined} name={featured.name} size="sm" />
            </div>
          </div>
        </Link>
      )}
      <ul className="grid gap-3 px-4 pb-6 sm:grid-cols-2 sm:px-6">
        {rest.map((c) => (
          <li key={c.id}>
            <Link href={`/c/${c.slug}`} className="card group flex h-full flex-col overflow-hidden transition-shadow duration-200 hover:shadow-2">
              <div className="h-16 overflow-hidden"><CommunityArt slug={c.slug} className="transition-transform duration-700 group-hover:scale-105" /></div>
              <div className="-mt-6 flex flex-1 flex-col px-4 pb-4">
                <div className="flex items-end justify-between">
                  <CommunityIconTile slug={c.slug} name={c.name} size={48} />
                  <JoinButton communityId={c.id} joined={c.joined} name={c.name} size="sm" />
                </div>
                <h3 className="mt-2 text-[16px] font-semibold">{c.name}</h3>
                <p className="mt-0.5 line-clamp-2 flex-1 text-[14px] text-ink-2">{c.description}</p>
                <p className="num mt-2 text-[12.5px] text-ink-3">{c.members.toLocaleString("en-US")} members · {c.postsThisWeek} posts this week</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
