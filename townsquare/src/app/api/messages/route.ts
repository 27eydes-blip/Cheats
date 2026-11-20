import { NextResponse, type NextRequest } from "next/server";
import { thread, unreadMessages } from "@/lib/messages";
import { getViewer } from "@/lib/session";
import { userByHandle } from "@/lib/users";

export const dynamic = "force-dynamic";

/** GET /api/messages?with=handle&after=ms → new messages in one conversation (and your total unread). Yours only. */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const peer = userByHandle(req.nextUrl.searchParams.get("with") ?? "");
  const after = Number(req.nextUrl.searchParams.get("after")) || 0;
  return NextResponse.json({ messages: peer ? thread(viewer.id, peer.id, after) : [], unread: unreadMessages(viewer.id) }, { headers: { "Cache-Control": "no-store" } });
}
