import { seeOther } from "@/lib/http";
import { accessCookie, cookieMaxAgeSeconds, purchaseFromToken } from "@/lib/access";
import { getCityById, purchaseGrantsAccess } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** Magic link target (from emails + success page). Sets the access cookie. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = await getEnv();
  const purchase = await purchaseFromToken(env.DB, token, env.ACCESS_TOKEN_SECRET);
  const city = purchase ? await getCityById(env.DB, purchase.city_id) : null;
  if (!purchase || !city || !purchaseGrantsAccess(purchase, city.id)) {
    const to = city ? `/city/${city.slug}/restore?error=link` : "/";
    return seeOther(to);
  }
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return seeOther(`/city/${city.slug}?welcome=1`, {
    "Set-Cookie": `${accessCookie(city.slug)}=${token}; Path=/; Max-Age=${cookieMaxAgeSeconds(purchase)}; HttpOnly; SameSite=Lax${secure}`,
    "Referrer-Policy": "no-referrer",
  });
}
