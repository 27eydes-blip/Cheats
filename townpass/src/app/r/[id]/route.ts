import { getEnv } from "@/lib/env";
import { seeOther } from "@/lib/http";
import { validateReserveUrl } from "@/lib/reserve";

/** "Reserve" button target: counts the tap, then sends the visitor to the booking page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const env = await getEnv();
  const row = await env.DB.prepare(
    "SELECT l.id, l.reserve_url, s.city_id FROM listings l JOIN sections s ON s.id = l.section_id WHERE l.id = ? AND l.active = 1",
  )
    .bind(Number(id))
    .first<{ id: number; reserve_url: string | null; city_id: number }>();
  if (!row?.reserve_url || validateReserveUrl(row.reserve_url)) return seeOther("/");

  await env.DB.prepare("INSERT INTO reserve_clicks (listing_id, city_id, created_at) VALUES (?, ?, ?)")
    .bind(row.id, row.city_id, Date.now())
    .run()
    .catch(() => {}); // never block the booking over analytics
  return new Response(null, { status: 302, headers: { Location: row.reserve_url, "Cache-Control": "no-store", "Referrer-Policy": "origin" } });
}
