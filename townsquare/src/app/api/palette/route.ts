import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { searchUsers, trending } from "@/lib/feed";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Quick results for the command palette: people, topics, communities, stories. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const viewer = await getViewer();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const lower = q.toLowerCase().replace(/^#/, "");
  return NextResponse.json({
    people: q ? searchUsers(q, viewer?.id ?? null, 5).map((u) => ({ handle: u.handle, displayName: u.displayName, avatarUrl: u.avatarUrl, verified: u.verified })) : [],
    tags: trending(30).filter((t) => !q || t.tag.includes(lower)).slice(0, q ? 4 : 5).map((t) => ({ tag: t.tag, posts: t.posts })),
    communities: all<{ slug: string; name: string }>(
      "SELECT slug, name FROM communities WHERE visibility = 'public' AND (? = '' OR name LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\') LIMIT 4",
      [q, like, like],
    ).map((c) => ({ ...c })),
    stories: listStories(20).filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())).slice(0, 3).map((s) => ({ key: s.key, title: s.title, status: s.status })),
  });
}
