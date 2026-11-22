import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/session";
import { buildBoard } from "@/lib/sports/hub";
import { viewerTz } from "@/lib/sports/viewer-tz";
import { LEAGUES, type League } from "@/lib/sports/teams-data";

export const dynamic = "force-dynamic";

/** The sports hub board, for the 30-second live refresh. */
export async function GET(req: NextRequest) {
  const want = req.nextUrl.searchParams.get("league")?.toUpperCase();
  const league = (LEAGUES as readonly string[]).includes(want ?? "") ? (want as League) : null;
  const viewer = await getViewer();
  const board = buildBoard({ leagues: league ? [league] : undefined, tz: await viewerTz(), viewerId: viewer?.id ?? null });
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
