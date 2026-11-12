import Stripe from "stripe";

let cached: { key: string; client: Stripe } | null = null;

/** Stripe client configured for the Workers runtime (fetch + WebCrypto). */
export function stripeClient(env: CloudflareEnv): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (cached?.key !== env.STRIPE_SECRET_KEY) {
    cached = {
      key: env.STRIPE_SECRET_KEY,
      client: new Stripe(env.STRIPE_SECRET_KEY, {
        httpClient: Stripe.createFetchHttpClient(),
        maxNetworkRetries: 2,
      }),
    };
  }
  return cached.client;
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider();
