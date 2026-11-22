import { NextResponse } from "next/server";
import { aiAvatar } from "@/lib/ai/avatars";

/** An AI account's portrait: an uploaded image if there is one, else its illustrated SVG. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const a = await aiAvatar((await params).handle);
  if (!a) return new NextResponse(null, { status: 404 });
  return new NextResponse(typeof a.body === "string" ? a.body : new Uint8Array(a.body), {
    headers: {
      "content-type": a.type,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
