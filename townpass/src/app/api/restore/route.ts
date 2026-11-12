import { seeOther } from "@/lib/http";
import { accessToken } from "@/lib/access";
import { accessLabel, getCityBySlug, type Purchase } from "@/lib/db";
import { accessEmail, sendMail } from "@/lib/email";
import { baseUrl, getEnv } from "@/lib/env";
import { clientHash, rateLimit } from "@/lib/ratelimit";

/** Restore access by receipt email: emails a magic link (never reveals if a purchase exists). */
export async function POST(req: Request) {
  const env = await getEnv();
  const db = env.DB;
  const base = baseUrl(env);
  const form = await req.formData();
  const slug = String(form.get("city") || "");
  const email = String(form.get("email") || "").toLowerCase().trim();
  const city = await getCityBySlug(db, slug);
  if (!city) return new Response("Not found", { status: 404 });
  const back = `/city/${city.slug}/restore`;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return seeOther(`${back}?error=email`);
  }
  const who = await clientHash(req.headers, env.ACCESS_TOKEN_SECRET);
  const okIp = await rateLimit(db, `restore:ip:${who}`, 10, 3_600_000);
  const okEmail = await rateLimit(db, `restore:email:${email}`, 3, 3_600_000);
  if (!okIp || !okEmail) return seeOther(`${back}?error=slow`);

  const purchase = await db
    .prepare(
      `SELECT * FROM purchases WHERE email = ? AND city_id = ? AND status = 'paid'
       AND (access_expires_at IS NULL OR access_expires_at > ?) ORDER BY paid_at DESC LIMIT 1`,
    )
    .bind(email, city.id, Date.now())
    .first<Purchase>();

  if (purchase) {
    const link = `${base}/access/${await accessToken(purchase.id, env.ACCESS_TOKEN_SECRET)}`;
    const mail = accessEmail({ brand: env.BRAND_NAME, cityName: city.name, link, restore: true, access: accessLabel(city) });
    await sendMail(env, { to: email, ...mail });
  }
  return seeOther(`${back}?sent=1`);
}
