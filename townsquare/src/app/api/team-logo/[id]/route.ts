import { readLogo } from "@/lib/sports/logo-provider";

export const dynamic = "force-dynamic";

/** Cached team logo (licensed provider or Control Room upload). 404 → the client shows the generated badge. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const buf = readLogo((await params).id);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800", "X-Content-Type-Options": "nosniff" },
  });
}
