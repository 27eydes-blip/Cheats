import type Stripe from "stripe";
import { accessToken } from "./access";
import { accessLabel, getCityById, getPurchase, type Purchase } from "./db";
import { accessEmail, sendMail } from "./email";
import { baseUrl } from "./env";

/**
 * Idempotently mark a purchase paid from a Stripe Checkout Session that Stripe
 * itself reported (webhook) or that we fetched server-to-server from Stripe's
 * API. Never trust anything from the browser here.
 */
export async function fulfillSession(env: CloudflareEnv, session: Stripe.Checkout.Session): Promise<Purchase | null> {
  const db = env.DB;
  const purchaseId = session.metadata?.purchase_id;
  if (!purchaseId) return null;
  const purchase = await getPurchase(db, purchaseId);
  if (!purchase) return null;
  if (session.payment_status !== "paid") return purchase;
  if (session.amount_total !== purchase.amount_cents) {
    console.error("Amount mismatch for purchase", purchaseId, session.amount_total, purchase.amount_cents);
    return purchase;
  }

  const city = await getCityById(db, purchase.city_id);
  if (!city) return purchase;

  const now = Date.now();
  const email = (session.customer_details?.email || session.customer_email || "").toLowerCase().trim() || null;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const expires = city.access_hours ? now + city.access_hours * 3_600_000 : null;

  const res = await db
    .prepare(
      `UPDATE purchases SET status = 'paid', email = ?, stripe_payment_intent = ?, paid_at = ?, access_expires_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(email, pi, now, expires, purchaseId)
    .run();

  const updated = await getPurchase(db, purchaseId);
  // Only the call that actually flipped pending -> paid sends the email.
  if (res.meta.changes > 0 && updated?.email) {
    const link = `${baseUrl(env)}/access/${await accessToken(updated.id, env.ACCESS_TOKEN_SECRET)}`;
    const mail = accessEmail({ brand: env.BRAND_NAME, cityName: city.name, link, access: accessLabel(city) });
    if (await sendMail(env, { to: updated.email, ...mail })) {
      await db.prepare("UPDATE purchases SET email_sent_at = ? WHERE id = ?").bind(Date.now(), updated.id).run();
    }
  }
  return updated;
}

/** Revoke access when a payment is refunded (fully) or disputed. */
export async function revokeByPaymentIntent(env: CloudflareEnv, paymentIntent: string, status: "refunded" | "disputed") {
  await env.DB.prepare(
    `UPDATE purchases SET status = ?, refunded_at = ? WHERE stripe_payment_intent = ? AND status IN ('paid','pending')`,
  )
    .bind(status, Date.now(), paymentIntent)
    .run();
}
