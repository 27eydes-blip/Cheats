import { NextResponse, type NextRequest } from "next/server";
import { sponsorBannerBytes, sponsorImageBytes, sponsorOriginalBytes } from "@/lib/ads";

/**
 * A sponsor's image as WebP: the 1200 or 600 wide card image, or with
 * kind=banner the 16:5 banner crop (1600 or 800 wide) at its focal point.
 * The URL carries a version, so it can be cached for a long time.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sp = req.nextUrl.searchParams;
  const id = (await params).id;
  const w = Number(sp.get("w"));
  const kind = sp.get("kind");
  const buf = kind === "banner" ? await sponsorBannerBytes(id, w >= 1600 ? 1600 : 800) : kind === "orig" ? await sponsorOriginalBytes(id) : await sponsorImageBytes(id, w >= 1200 ? 1200 : 600);
  if (!buf) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
}
