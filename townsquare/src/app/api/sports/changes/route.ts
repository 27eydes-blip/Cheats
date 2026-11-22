import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { changedGames, lastChecked } from "@/lib/sports/games";
import { LEAGUES, type League } from "@/lib/sports/teams-data";

export const dynamic = "force-dynamic";

/** Furthest back a client may ask; older cursors are told to reload the whole board. */
const MAX_AGE_MS = 6 * 3_600_000;

/**
 * GET /api/sports/changes?since=<ms>&league=NFL — only the games that changed
 * since the client's cursor. Small, cheap (database only, never the data
 * provider), and ETag-aware: an unchanged answer is a bodiless 304.
 */
export async function GET(req: NextRequest) {
  const t = Date.now();
  const sp = req.nextUrl.searchParams;
  const since = Number(sp.get("since"));
  const want = sp.get("league")?.toUpperCase();
  const league = (LEAGUES as readonly string[]).includes(want ?? "") ? (want as League) : null;
  if (!Number.isFinite(since) || since <= 0 || since > t + 60_000 || t - since > MAX_AGE_MS) {
    return NextResponse.json({ full: true, at: t, syncedAt: lastChecked(), games: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  // A second of overlap so a change written in the same instant as the last answer is never missed; merging is idempotent.
  const games = changedGames(since - 1_000, { leagues: league ? [league] : undefined, t });
  const syncedAt = lastChecked();
  const etag = `W/"${createHash("sha1").update(JSON.stringify([games, syncedAt])).digest("base64url").slice(0, 20)}"`;
  const headers = { "Cache-Control": "no-cache", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json({ full: false, at: t, syncedAt, games }, { headers });
}
