import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { searchPosts, searchUsers } from "@/lib/feed";
import { listStories } from "@/lib/news";
import { getViewer } from "@/lib/session";
import { searchTeams } from "@/lib/sports/teams";

export const dynamic = "force-dynamic";

/** Grouped results for the search overlay: Stories, Voices, Desks, Takes. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const viewer = await getViewer();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const ql = q.toLowerCase();
  const stories = listStories(40, { order: q ? "fresh" : "hot", viewerId: viewer?.id ?? null })
    .filter((s) => !q || s.title.toLowerCase().includes(ql) || s.summary.toLowerCase().includes(ql) || s.section.toLowerCase().includes(ql) || s.tag?.includes(ql.replace(/^#/, "")))
    .slice(0, q ? 6 : 5)
    .map((s) => ({ key: s.key, title: s.title, section: s.section, status: s.status, takes: s.takes, split: s.split }));
  return NextResponse.json({
    stories,
    teams: q ? searchTeams(q, 5) : [],
    voices: q ? searchUsers(q, viewer?.id ?? null, 5).map((u) => ({ handle: u.handle, displayName: u.displayName, avatarUrl: u.avatarUrl, verified: u.verified, bio: u.bio })) : [],
    desks: all<{ slug: string; name: string; description: string }>(
      "SELECT slug, name, description FROM communities WHERE visibility = 'public' AND (? = '' OR name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') LIMIT 4",
      [q, like, like],
    ).map((c) => ({ ...c })),
    takes: q ? searchPosts(q, viewer?.id ?? null, null, 5).items.map((i) => ({ id: i.post.id, body: i.post.body.slice(0, 140), author: i.post.author.displayName, stance: i.post.stance })) : [],
  });
}
