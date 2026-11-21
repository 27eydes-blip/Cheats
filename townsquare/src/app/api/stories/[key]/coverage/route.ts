import { NextResponse } from "next/server";
import { getStory } from "@/lib/news";

/** The outlets covering a story (headline, outlet, time, link). Public: it is the same list as on the story page. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const s = getStory((await params).key);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ items: s.articles }, { headers: { "cache-control": "public, max-age=60" } });
}
