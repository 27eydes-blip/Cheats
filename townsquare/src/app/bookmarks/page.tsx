import Link from "next/link";
import { Frame } from "@/components/ui/Frame";
import { bookmarksFeed } from "@/lib/feed";
import { listStories } from "@/lib/news";
import { requireViewerPage } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vault" };

/** The Vault: dispatches you keep for later (private to you). */
export default async function Vault() {
  const viewer = await requireViewerPage("/bookmarks");
  const hot = listStories(3, { order: "hot", viewerId: viewer.id });
  return (
    <Frame>
      <PageHeader title="Vault" kicker={<span className="folio text-gold-ink">Saved for later</span>} subtitle="Dispatches you keep. Only you can see your Vault." />
      <Feed
        initial={bookmarksFeed(viewer.id)}
        source={{ tab: "bookmarks" }}
        empty={
          <div className="pb-6">
            <EmptyState art="bookmarks" title="Your Vault is empty" body="Tap the Vault icon on any dispatch to keep it here. Good places to start:" />
            <ul className="mx-4 space-y-2 sm:mx-6">
              {hot.map((s) => (
                <li key={s.key}>
                  <Link href={`/news/story/${s.key}`} className="card card-hover flex min-h-12 items-center justify-between gap-3 px-4 py-3">
                    <span className="font-display text-[17px] leading-snug font-bold">{s.title}</span>
                    <span className="mono shrink-0 text-[11px] text-ink-3">{s.takes} dispatches</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        }
      />
    </Frame>
  );
}
