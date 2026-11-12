import { getEnv } from "@/lib/env";
import { cleanPlacement, SPONSOR, sponsorTarget } from "@/lib/sponsor";

/** /go/glydrift?from=guide-home&city=montauk → count the tap, then redirect to glydrift.com. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const placement = cleanPlacement(url.searchParams.get("from"));
  const city = (url.searchParams.get("city") || "").toLowerCase();
  const env = await getEnv();
  await env.DB.prepare("INSERT INTO sponsor_clicks (sponsor, placement, city_slug, created_at) VALUES (?, ?, ?, ?)")
    .bind(SPONSOR.id, placement, /^[a-z0-9-]{1,40}$/.test(city) ? city : null, Date.now())
    .run()
    .catch(() => {}); // never block the visitor over analytics
  return new Response(null, { status: 302, headers: { Location: sponsorTarget(placement), "Cache-Control": "no-store" } });
}
