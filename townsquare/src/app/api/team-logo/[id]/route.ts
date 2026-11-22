import type { NextRequest } from "next/server";
import { readLogoFile } from "@/lib/sports/logos";
import { getTeam } from "@/lib/sports/teams";

export const dynamic = "force-dynamic";

/**
 * A stored team logo. ?k=upload|tsdb picks the source (default: the one the team
 * shows), ?s=128|512 the size. 404 → the page shows the letter badge instead.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const q = req.nextUrl.searchParams;
  const size = q.get("s") === "512" ? 512 : 128;
  const k = q.get("k");
  const kind = k === "upload" || k === "tsdb" ? k : (() => {
    const t = getTeam(id);
    return t && t.logoSource !== "letter" ? t.logoSource : null;
  })();
  const file = kind ? readLogoFile(id, kind, size) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.buf), {
    headers: {
      "Content-Type": file.type,
      // URLs carry a version (?v=), so a changed logo gets a new URL.
      "Cache-Control": q.get("v") ? "public, max-age=604800, immutable" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
