import { readMediaFor } from "@/lib/media";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Serves stored images after an access check (the "private bucket" gate). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(id)) return new Response("Not found", { status: 404 });
  const viewer = await getViewer();
  const m = readMediaFor(id, viewer?.id ?? null);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Cache-Control": m.isPublic ? "public, max-age=3600" : "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
