// Supabase Edge Function: verify a DRIFT PASS+ purchase before the game unlocks it.
//
// The app sends { transactionId, productId } with the player's session. This function asks
// Apple's App Store Server API (over TLS, authenticated with your App Store Connect API key)
// for that transaction, and only if Apple confirms it — right app, right product, bought by
// this account (appAccountToken), not refunded — records it in public.purchases.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   APPSTORE_ISSUER_ID, APPSTORE_KEY_ID, APPSTORE_PRIVATE_KEY (the .p8 file's contents),
//   APPSTORE_BUNDLE_ID (com.glydrift.game)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase on its
// own servers; the service role is used only here, server-side, to write the purchase row.
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT, decodeJwt } from "npm:jose@5";

const PRODUCT = /^com\.glydrift\.game\.driftpassplus\.([a-z0-9]{1,16})$/;
const APPLE = {
  Production: "https://api.storekit.itunes.apple.com",
  Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function appleToken(): Promise<string> {
  const key = await importPKCS8(Deno.env.get("APPSTORE_PRIVATE_KEY")!, "ES256");
  return await new SignJWT({ bid: Deno.env.get("APPSTORE_BUNDLE_ID") })
    .setProtectedHeader({ alg: "ES256", kid: Deno.env.get("APPSTORE_KEY_ID")!, typ: "JWT" })
    .setIssuer(Deno.env.get("APPSTORE_ISSUER_ID")!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("appstoreconnect-v1")
    .sign(key);
}

/** Ask Apple for a transaction: production first, then the sandbox (TestFlight / review). */
async function fetchTransaction(id: string) {
  const token = await appleToken();
  for (const env of ["Production", "Sandbox"] as const) {
    const res = await fetch(`${APPLE[env]}/inApps/v1/transactions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`App Store Server API ${res.status}`);
    const { signedTransactionInfo } = await res.json();
    // fetched straight from Apple over TLS: its payload is Apple's own answer
    return { env, tx: decodeJwt(signedTransactionInfo) as Record<string, unknown> };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply("ok");
  if (req.method !== "POST") return reply({ ok: false, reason: "POST only" }, 405);
  try {
    // who is asking (their own session; anonymous players can buy too)
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return reply({ ok: false, reason: "Sign in again and retry." }, 401);

    const { transactionId, productId } = await req.json();
    const m = PRODUCT.exec(String(productId || ""));
    if (!m || !transactionId) return reply({ ok: false, reason: "Unknown product." }, 400);
    const seasonId = m[1];

    const found = await fetchTransaction(String(transactionId));
    if (!found) return reply({ ok: false, reason: "Apple doesn't know this purchase." }, 400);
    const { env, tx } = found;
    if (tx.bundleId !== Deno.env.get("APPSTORE_BUNDLE_ID"))
      return reply({ ok: false, reason: "Purchase is for a different app." }, 400);
    if (tx.productId !== productId)
      return reply({ ok: false, reason: "Purchase is for a different product." }, 400);
    if (tx.appAccountToken && tx.appAccountToken !== user.id)
      return reply({ ok: false, reason: "Purchase belongs to a different player." }, 403);
    if (tx.revocationDate) return reply({ ok: false, reason: "This purchase was refunded." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: existing } = await admin
      .from("purchases")
      .select("user_id")
      .eq("transaction_id", String(tx.transactionId))
      .maybeSingle();
    if (existing && existing.user_id !== user.id)
      return reply({ ok: false, reason: "Purchase belongs to a different player." }, 403);
    const { error } = await admin.from("purchases").upsert(
      {
        user_id: user.id,
        season_id: seasonId,
        product_id: productId,
        transaction_id: String(tx.transactionId),
        original_transaction_id: String(tx.originalTransactionId ?? tx.transactionId),
        environment: env,
        purchased_at: new Date(Number(tx.purchaseDate)).toISOString(),
      },
      { onConflict: "transaction_id" },
    );
    if (error) throw error;
    return reply({ ok: true, seasonId });
  } catch (err) {
    console.error(err);
    return reply({ ok: false, reason: "Couldn't verify right now. Try RESTORE PURCHASES." }, 500);
  }
});
