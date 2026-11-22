import { NextResponse, type NextRequest } from "next/server";
import { sponsorMotion } from "@/lib/ads";

/** A sponsor's optional short motion (muted MP4 or animated WebP, under 2 MB). Versioned URL, cached long. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = sponsorMotion((await params).id);
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(m.buf), { headers: { "content-type": m.type, "content-length": String(m.buf.length), "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "accept-ranges": "none" } });
}
