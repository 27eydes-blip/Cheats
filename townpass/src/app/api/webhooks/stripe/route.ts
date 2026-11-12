import type Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { fulfillSession, revokeByPaymentIntent } from "@/lib/fulfill";
import { cryptoProvider, stripeClient } from "@/lib/stripe";

/**
 * Stripe webhook. Subscribe to:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.expired, charge.refunded, charge.dispute.created
 */
export async function POST(req: Request) {
  const env = await getEnv();
  const stripe = stripeClient(env);
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    console.warn("Bad webhook signature", (e as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  // Idempotency: Stripe may deliver the same event more than once.
  const seen = await env.DB.prepare("SELECT id FROM stripe_events WHERE id = ?").bind(event.id).first();
  if (seen) return Response.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillSession(env, event.data.object as Stripe.Checkout.Session);
      break;
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      await env.DB.prepare("UPDATE purchases SET status = 'expired' WHERE stripe_session_id = ? AND status = 'pending'")
        .bind(s.id)
        .run();
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      // Any refund on a pass revokes access (partial refunds included).
      if (pi && charge.amount_refunded > 0) await revokeByPaymentIntent(env, pi, "refunded");
      break;
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      if (pi) await revokeByPaymentIntent(env, pi, "disputed");
      break;
    }
  }

  await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)")
    .bind(event.id, event.type, Date.now())
    .run();
  return Response.json({ received: true });
}
