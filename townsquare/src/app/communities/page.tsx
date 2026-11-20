import Link from "next/link";
import { listCommunities, pinnedStoryKey } from "@/lib/communities";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { CommunityIconTile } from "@/components/community/CommunityArt";
import { JoinButton } from "@/components/community/JoinButton";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Desks" };

/** The Desks: topic rooms run by Editors, each with a pinned national Story. */
export default async function Desks() {
  const viewer = await getViewer();
  const list = listCommunities(viewer?.id ?? null);
  const stories = new Map(listStories(50).map((s) => [s.key, s]));
  return (
    <Frame width="wide">
      <PageTitle folio={<Kicker tone="gold">Communities</Kicker>} title="The Desks" dek="Rooms for every beat, run by Editors from the community. Argue the idea, not the person." />
      <ul className="grid gap-x-10 px-4 pt-6 sm:px-6 md:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const pin = stories.get(pinnedStoryKey(c.id) ?? "");
          return (
            <li key={c.id} className="border-t-2 border-navy-ink py-4">
              <Link href={`/c/${c.slug}`} className="group flex items-start gap-3">
                <CommunityIconTile slug={c.slug} name={c.name} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[22px] leading-tight font-semibold group-hover:underline">{c.name}</span>
                  <span className="mono block text-[11px] text-ink-3">{c.members.toLocaleString("en-US")} MEMBERS · {c.postsThisWeek} THIS WEEK</span>
                </span>
              </Link>
              <p className="mt-2 line-clamp-2 text-[14.5px] text-ink-2">{c.description}</p>
              {pin && (
                <Link href={`/news/story/${pin.key}`} className="mt-3 block border-l-2 border-gold pl-3 text-[13.5px] leading-snug hover:underline">
                  <span className="folio block !text-[9.5px] text-gold-ink">Pinned story</span>
                  <span className="font-semibold">{pin.title}</span>
                </Link>
              )}
              <div className="mt-3"><JoinButton communityId={c.id} joined={c.joined} name={c.name} size="sm" /></div>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}
