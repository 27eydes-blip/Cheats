import { NextResponse, type NextRequest } from "next/server";
import { newFollowingCount, newForYouCount } from "@/lib/feed";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  const since = Number(req.nextUrl.searchParams.get("since")) || Date.now();
  const tab = req.nextUrl.searchParams.get("tab");
  const count = tab === "following" ? (viewer ? newFollowingCount(viewer.id, since) : 0) : newForYouCount(viewer?.id ?? null, since);
  return NextResponse.json({ count });
}
