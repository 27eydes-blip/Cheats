import { seeOther } from "@/lib/http";
import { getCityBySlug } from "@/lib/db";
import { baseUrl, getEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";
import { randomId } from "@/lib/token";

/** Plain HTML form POST -> create Stripe Checkout Session -> 303 to Stripe. */
export async function POST(req: Request) {
  const env = await getEnv();
  const db = env.DB;
  const form = await req.formData();
  const slug = String(form.get("city") || "");
  const city = await getCityBySlug(db, slug);
  if (!city || !city.published) return new Response("Not found", { status: 404 });

  // Only attribute to stickers that really belong to this city.
  let stickerId: string | null = null;
  const src = String(form.get("src") || "").toUpperCase();
  if (src) {
    const s = await db.prepare("SELECT id FROM stickers WHERE id = ? AND city_id = ?").bind(src, city.id).first<{ id: string }>();
    stickerId = s?.id ?? null;
  }

  const base = baseUrl(env);
  const purchaseId = randomId();
  const metadata = { purchase_id: purchaseId, city_id: String(city.id), city_slug: city.slug, sticker_id: stickerId ?? "" };

  try {
    const session = await stripeClient(env).checkout.sessions.create({
      mode: "payment",
      // No payment_method_types: Stripe shows the methods enabled in your
      // Dashboard (Card + Apple Pay + Google Pay) automatically.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: city.currency,
            unit_amount: city.price_cents,
            product_data: {
              name: `${env.BRAND_NAME}: ${city.name}, ${city.state} guide`,
              description: city.access_hours ? `${city.access_hours}-hour access` : "Lifetime access",
            },
          },
        },
      ],
      submit_type: "pay",
      billing_address_collection: "auto",
      metadata,
      payment_intent_data: { metadata, description: `${env.BRAND_NAME} ${city.name} guide` },
      success_url: `${base}/city/${city.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/city/${city.slug}?canceled=1${stickerId ? `&src=${encodeURIComponent(stickerId)}` : ""}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h (Stripe minimum is 30 min)
    });

    await db
      .prepare(
        `INSERT INTO purchases (id, city_id, sticker_id, status, amount_cents, currency, stripe_session_id, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .bind(purchaseId, city.id, stickerId, city.price_cents, city.currency, session.id, Date.now())
      .run();

    return Response.redirect(session.url!, 303);
  } catch (e) {
    console.error("checkout error", e);
    return seeOther(`/city/${city.slug}?error=checkout`);
  }
}
