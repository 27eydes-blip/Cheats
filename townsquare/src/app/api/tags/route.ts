import { NextResponse, type NextRequest } from "next/server";
import { all, now } from "@/lib/db";

export const dynamic = "force-dynamic";

const TOPIC_TAGS = ["politics", "markets", "sports", "tech", "world", "culture", "breaking", "elections", "economy", "climate", "ai", "health"];

/** #topic tag suggestions: trending tags from the last week, then house topics. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").replace(/^#/, "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 30);
  const trending = all<{ tag: string; n: number }>(
    "SELECT tag, count(*) n FROM post_hashtags WHERE created_at > ? AND tag LIKE ? GROUP BY tag ORDER BY n DESC LIMIT 6",
    [now() - 7 * 86_400_000, `${q}%`],
  );
  const seen = new Set(trending.map((t) => t.tag));
  const extra = TOPIC_TAGS.filter((t) => t.startsWith(q) && !seen.has(t)).map((tag) => ({ tag, n: 0 }));
  return NextResponse.json([...trending, ...extra].slice(0, 8));
}
