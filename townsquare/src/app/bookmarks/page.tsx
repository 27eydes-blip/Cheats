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
    <>
      <PageHeader title="Bookmarks" subtitle="Only you can see what you save" />
      <Feed initial={bookmarksFeed(viewer.id)} source={{ tab: "bookmarks" }} empty={<EmptyState art="bookmarks" title="Save posts for later" body="Tap the bookmark on any post. Your saved posts are private to you." />} />
    </>
  );
}
