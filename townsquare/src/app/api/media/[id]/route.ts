import type { NextRequest } from "next/server";
import { MEDIA_WIDTHS, readMediaFor, resized } from "@/lib/media";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Serves stored images after an access check (the "private bucket" gate).
 * `?w=` returns a resized copy, which gives responsive srcsets without
 * next/image's optimizer (that optimizer can't forward the viewer's cookie).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) return new Response("Not found", { status: 404 });
  const viewer = await getViewer();
  const m = readMediaFor(id, viewer?.id ?? null);
  if (!m) return new Response("Not found", { status: 404 });
  const w = Number(req.nextUrl.searchParams.get("w"));
  const width = MEDIA_WIDTHS.find((x) => x >= w) ?? null;
  const data = w && width ? await resized(m.data, m.file, width) : m.data;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": m.mime,
      "Cache-Control": m.isPublic ? "public, max-age=86400, stale-while-revalidate=604800" : "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
