import Link from "next/link";
import { recentHistory } from "@/lib/history";
import { requireViewerPage } from "@/lib/session";
import { PostCard } from "@/components/PostCard";
import { Time } from "@/components/Time";
import { StoryArt } from "@/components/front/StoryArt";
import { CategoryTag, Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { EmptyState } from "@/components/ui/States";
import { ClearHistory } from "./ClearHistory";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

/** History: the stories and dispatches you opened. Private to you; clear it any time. */
export default async function History() {
  const viewer = await requireViewerPage("/history");
  const items = recentHistory(viewer.id);
  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Only you can see this</Kicker>} title="History" dek="Stories and dispatches you opened, most recent first.">
        {items.length > 0 && <ClearHistory />}
      </PageTitle>
      {items.length === 0 ? (
        <div className="px-3 pt-4 sm:px-4"><div className="card"><EmptyState art="search" title="Nothing here yet" body="Open a story or a dispatch and it will be waiting here when you want to find it again." action={{ label: "Go to For You", href: "/" }} /></div></div>
      ) : (
        <ul className="space-y-3 px-3 pt-4 sm:px-4">
          {items.map((it) => (
            <li key={`${it.kind}:${it.kind === "story" ? it.story.key : it.post.id}`} className="card overflow-hidden">
              <p className="mono px-4 pt-3 text-[11px] text-ink-3">OPENED <Time ms={it.at} /> AGO</p>
              {it.kind === "story" ? (
                <Link href={`/news/story/${it.story.key}`} className="group flex items-center gap-3 p-3">
                  <span className="block aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-[10px]"><StoryArt seed={it.story.key} section={it.story.section} photo={it.story.photo} width={320} /></span>
                  <span className="min-w-0"><CategoryTag>{it.story.section === "Top Stories" ? "National" : it.story.section}</CategoryTag><span className="mt-1.5 block font-display text-[19px] leading-tight font-bold group-hover:text-[var(--wn-cyan-ink)]">{it.story.title}</span></span>
                </Link>
              ) : (
                <PostCard flat post={it.post} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
