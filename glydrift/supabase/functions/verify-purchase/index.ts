// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
//
// Supabase Edge Function: verify a DRIFT PASS+ purchase before the game unlocks it.
//
// The app sends { transactionId, productId } with the player's session. This function asks
// Apple's App Store Server API for that transaction (see ../_shared/apple.ts). Only when Apple
// confirms all of these does it record the purchase in public.purchases:
//   - it's for this app and this product,
//   - it was bought by this account (appAccountToken), or by nobody else,
//   - it hasn't been refunded.
// One purchase belongs to one account, and two requests at once can't both claim it.
//
// Sandbox (TestFlight / App Review) purchases unlock the game, because App Review must be
// able to test the purchase. They're stored as environment = 'Sandbox' and never give paid
// extras on the public leaderboard (see migration 20261105000001). To refuse them entirely,
// for example after launch, set the secret ALLOW_SANDBOX=false.
//
// Secrets: see ../_shared/apple.ts. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase on its own servers. The service role is
// used only here, server-side, to write the purchase row; it's never in the app or the repo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchTransaction, reply } from "../_shared/apple.ts";

const PRODUCT = /^com\.glydrift\.game\.driftpassplus\.([a-z0-9]{1,16})$/;
const OTHER_PLAYER = "Purchase belongs to a different player.";

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
    if (env === "Sandbox" && Deno.env.get("ALLOW_SANDBOX") === "false")
      return reply({ ok: false, reason: "Test purchases aren't accepted." }, 400);
    if (tx.bundleId !== Deno.env.get("APPSTORE_BUNDLE_ID"))
      return reply({ ok: false, reason: "Purchase is for a different app." }, 400);
    if (tx.productId !== productId)
      return reply({ ok: false, reason: "Purchase is for a different product." }, 400);
    if (tx.appAccountToken && tx.appAccountToken !== user.id)
      return reply({ ok: false, reason: OTHER_PLAYER }, 403);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const txId = String(tx.transactionId);
    const originalId = String(tx.originalTransactionId ?? tx.transactionId);

    if (tx.revocationDate) {
      // refunded: make sure the server agrees, then refuse
      await admin.rpc("glydrift_revoke_purchase", { tx_id: txId });
      return reply({ ok: false, reason: "This purchase was refunded." }, 400);
    }

    // one purchase, one account: by its own id and by its original id (a purchase made
    // without the game's account token, e.g. an offer code, can't be claimed twice either)
    for (const [col, id] of [
      ["transaction_id", txId],
      ["original_transaction_id", originalId],
    ] as const) {
      const { data: owners, error } = await admin.from("purchases").select("user_id").eq(col, id);
      if (error) throw error;
      if ((owners ?? []).some((o) => o.user_id !== user.id))
        return reply({ ok: false, reason: OTHER_PLAYER }, 403);
    }

    // insert only; never take over an existing row (two requests at once can't both win)
    const { error } = await admin.from("purchases").upsert(
      {
        user_id: user.id,
        season_id: seasonId,
        product_id: productId,
        transaction_id: txId,
        original_transaction_id: originalId,
        environment: env,
        purchased_at: new Date(Number(tx.purchaseDate)).toISOString(),
      },
      { onConflict: "transaction_id", ignoreDuplicates: true },
    );
    // 23505 = this account already holds this season under another transaction: still owned
    if (error && error.code !== "23505") throw error;
    const { data: row, error: e2 } = await admin
      .from("purchases")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("season_id", seasonId)
      .is("revoked_at", null)
      .maybeSingle();
    if (e2) throw e2;
    if (!row) return reply({ ok: false, reason: OTHER_PLAYER }, 403);
    return reply({ ok: true, seasonId });
  } catch (err) {
    console.error(err);
    return reply({ ok: false, reason: "Couldn't verify right now. Try RESTORE PURCHASES." }, 500);
  }
});
