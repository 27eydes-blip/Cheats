import { NextResponse, type NextRequest } from "next/server";
import { sponsorImageBytes } from "@/lib/ads";

/** A sponsor's image (600 or 1200 wide, WebP). The URL carries a version, so it can be cached for a long time. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const w = Number(req.nextUrl.searchParams.get("w")) >= 1200 ? 1200 : 600;
  const buf = await sponsorImageBytes((await params).id, w);
  if (!buf) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
