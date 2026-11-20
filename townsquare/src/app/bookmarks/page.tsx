import { Frame } from "@/components/ui/Frame";
import { bookmarksFeed } from "@/lib/feed";
import { requireViewerPage } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookmarks" };

export default async function Bookmarks() {
  const viewer = await requireViewerPage("/bookmarks");
  return (
    <Frame>
      <PageHeader title="Saved" kicker={<span className="folio text-gold-ink">Your Rundown</span>} subtitle="Takes you saved for later. Only you can see these." />
      <Feed initial={bookmarksFeed(viewer.id)} source={{ tab: "bookmarks" }} empty={<EmptyState art="bookmarks" title="Nothing saved yet" body="Tap Save on any take to keep it in your Rundown. Only you can see what you save." />} />
    </Frame>
  );
}
