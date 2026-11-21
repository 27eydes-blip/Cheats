import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/session";
import { removeSubscription, saveSubscription } from "@/lib/push/push";
import { userMessage } from "@/lib/errors";

/** Only accept requests from our own pages. */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin || origin === `https://${req.headers.get("host")}` || origin === `http://${req.headers.get("host")}`;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Log in first" }, { status: 401 });
  try {
    const body = (await req.json()) as { subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; replaces?: string };
    if (body.replaces) removeSubscription(viewer.id, String(body.replaces));
    saveSubscription(viewer.id, body.subscription, req.headers.get("user-agent") ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: userMessage(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Log in first" }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) removeSubscription(viewer.id, String(endpoint));
  return NextResponse.json({ ok: true });
}
