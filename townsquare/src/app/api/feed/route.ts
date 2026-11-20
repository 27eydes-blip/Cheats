import { NextResponse, type NextRequest } from "next/server";
import { bookmarksFeed, followingFeed, forYouFeed, profileFeed, searchPosts, type ProfileTab } from "@/lib/feed";
import { getViewer } from "@/lib/session";
import { userByHandle } from "@/lib/users";

export const dynamic = "force-dynamic";

/** GET-only feed pagination for infinite scroll. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const viewer = await getViewer();
  const cursor = p.get("cursor");
  const tab = p.get("tab");
  const empty = { items: [], nextCursor: null };
  switch (tab) {
    case "following":
      return NextResponse.json(viewer ? followingFeed(viewer.id, cursor) : empty);
    case "foryou":
      return NextResponse.json(forYouFeed(viewer?.id ?? null, cursor));
    case "bookmarks":
      return NextResponse.json(viewer ? bookmarksFeed(viewer.id, cursor) : empty);
    case "search":
      return NextResponse.json(searchPosts(p.get("q") ?? "", viewer?.id ?? null, cursor));
    case "profile": {
      const u = userByHandle(p.get("handle") ?? "");
      const ptab = (["posts", "replies", "media", "likes"].includes(p.get("ptab") ?? "") ? p.get("ptab") : "posts") as ProfileTab;
      return NextResponse.json(u ? profileFeed(u.id, ptab, viewer?.id ?? null, cursor) : empty);
    }
    default:
      return NextResponse.json({ error: "unknown tab" }, { status: 400 });
  }
}
