import { notFound, redirect } from "next/navigation";
import { Brand, Notice } from "@/components/ui";
import { accessToken } from "@/lib/access";
import { getCityBySlug, getPurchaseBySession, purchaseGrantsAccess } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { fulfillSession } from "@/lib/fulfill";
import { stripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe redirects here after payment. Access is granted only once the
 * purchase is confirmed paid: normally by the webhook; if the webhook hasn't
 * arrived yet we ask Stripe's API directly (server-to-server) for the session.
 */
export default async function Success({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string; n?: string }>;
}) {
  const { slug } = await params;
  const { session_id, n } = await searchParams;
  const env = await getEnv();
  const city = await getCityBySlug(env.DB, slug);
  if (!city || !session_id || !/^cs_[A-Za-z0-9_]+$/.test(session_id)) notFound();

  let purchase = await getPurchaseBySession(env.DB, session_id);
  if (!purchase || purchase.city_id !== city.id) notFound();

  if (purchase.status === "pending") {
    try {
      const session = await stripeClient(env).checkout.sessions.retrieve(session_id);
      purchase = (await fulfillSession(env, session)) ?? purchase;
    } catch (e) {
      console.error("success: session retrieve failed", e);
    }
  }

  if (purchaseGrantsAccess(purchase, city.id)) {
    redirect(`/access/${await accessToken(purchase.id, env.ACCESS_TOKEN_SECRET)}`);
  }

  const attempt = Number(n || 0);
  const giveUp = attempt >= 10 || purchase.status !== "pending";
  return (
    <main className="mx-auto max-w-xl px-5 pt-8">
      {!giveUp && <meta httpEquiv="refresh" content={`2;url=/city/${city.slug}/success?session_id=${session_id}&n=${attempt + 1}`} />}
      <Brand name={env.BRAND_NAME} />
      <h1 className="mt-6 font-serif text-3xl">Confirming your payment…</h1>
      <div className="mt-6">
        {giveUp ? (
          <Notice tone="red">
            We couldn’t confirm this payment yet. If you were charged, you’ll get an email with your access link
            shortly, or use “Restore access” with your receipt email. Questions: {env.SUPPORT_EMAIL}
          </Notice>
        ) : (
          <Notice>This usually takes a couple of seconds. Don’t close this page.</Notice>
        )}
      </div>
      {giveUp && (
        <a href={`/city/${city.slug}/restore`} className="mt-6 block text-center text-gold underline">
          Restore access
        </a>
      )}
    </main>
  );
}
