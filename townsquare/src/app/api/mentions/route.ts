import { NextResponse, type NextRequest } from "next/server";
import { searchUsers } from "@/lib/feed";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/** @mention suggestions for the composer. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").replace(/^@/, "").slice(0, 30);
  const viewer = await getViewer();
  if (!viewer || !q) return NextResponse.json([]);
  return NextResponse.json(searchUsers(q, viewer.id, 6).map((u) => ({ handle: u.handle, displayName: u.displayName, avatarUrl: u.avatarUrl, verified: u.verified })));
}
