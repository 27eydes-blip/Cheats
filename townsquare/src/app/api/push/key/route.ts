import { NextResponse } from "next/server";
import { vapid } from "@/lib/push/push";

/** The public VAPID key browsers need to subscribe (public by design). null when push isn't set up. */
export function GET() {
  return NextResponse.json({ publicKey: vapid()?.pub ?? null });
}
