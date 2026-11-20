import { bookmarksFeed } from "@/lib/feed";
import { requireViewerPage } from "@/lib/session";
import { Feed } from "@/components/Feed";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookmarks" };

export default async function Bookmarks() {
  const viewer = await requireViewerPage("/bookmarks");
  return (
    <>
      <PageHeader title="Bookmarks" subtitle={`@${viewer.handle} · only you can see these`} />
      <Feed initial={bookmarksFeed(viewer.id)} source={{ tab: "bookmarks" }} empty="Save posts for later with the bookmark button. Only you can see your bookmarks." />
    </>
  );
}
