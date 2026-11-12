import { seeOther } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { clientHash, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const env = await getEnv();
  const db = env.DB;
  const form = await req.formData();
  const listingId = Number(form.get("listing_id"));
  const message = String(form.get("message") || "").trim().slice(0, 1000);

  const row = await db
    .prepare("SELECT c.slug FROM listings l JOIN sections s ON s.id = l.section_id JOIN cities c ON c.id = s.city_id WHERE l.id = ?")
    .bind(listingId)
    .first<{ slug: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const back = `/city/${row.slug}`;
  if (!message) return seeOther(`${back}#l${listingId}`);

  const who = await clientHash(req.headers, env.ACCESS_TOKEN_SECRET);
  if (await rateLimit(db, `report:${who}`, 20, 3_600_000)) {
    await db
      .prepare("INSERT INTO reports (listing_id, message, client_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(listingId, message, who, Date.now())
      .run();
  }
  return seeOther(`${back}?reported=${listingId}#l${listingId}`);
}
