import { NextResponse, type NextRequest } from "next/server";
import { bookmarksFeed, followingFeed, profileFeed, searchPosts, type ProfileTab } from "@/lib/feed";
import { getViewer } from "@/lib/session";
import { forYou } from "@/lib/foryou";
import { TOPIC_LABEL } from "@/lib/feedtabs-meta";
import { listFeed } from "@/lib/lists";
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
      return NextResponse.json(viewer ? followingFeed(viewer.id, cursor, undefined, { humanOnly: p.get("human") === "1" }) : empty);
    case "foryou":
      return NextResponse.json(
        forYou(viewer?.id ?? null, cursor, undefined, {
          excludeStory: p.get("exclude") ?? undefined,
          topic: p.get("topic") && p.get("topic")! in TOPIC_LABEL ? p.get("topic")! : undefined,
          teamId: p.get("team") ?? undefined,
          humanOnly: p.get("human") === "1",
        }),
      );
    case "list":
      return NextResponse.json(viewer ? listFeed(viewer.id, p.get("list") ?? "", cursor) : empty);
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
