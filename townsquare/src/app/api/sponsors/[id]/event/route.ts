import { NextResponse, type NextRequest } from "next/server";
import { countSponsorEvent } from "@/lib/ads";
import { get } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

/** Count a sponsored card view or click: once per visitor (by address) per sponsor every 30 minutes, so refreshes don't inflate it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.slice(0, 40);
  const kind = req.nextUrl.searchParams.get("kind") === "click" ? "click" : "view";
  if (!get("SELECT 1 FROM sponsors WHERE id = ?", [id])) return new NextResponse(null, { status: 204 });
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim().slice(0, 64);
  try {
    rateLimit("sponsorEvent", `${kind}:${ip}:${id}`);
    countSponsorEvent(id, kind);
  } catch {
    /* already counted recently */
  }
  return new NextResponse(null, { status: 204 });
}
