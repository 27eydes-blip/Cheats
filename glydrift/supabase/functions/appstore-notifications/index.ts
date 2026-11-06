// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE.
//
// Supabase Edge Function: App Store Server Notifications V2 → refunds take effect at once.
//
// Apple POSTs { signedPayload } here when something happens to a purchase. Anyone can POST to
// this URL, so the payload is NOT trusted: it's only a hint about which transaction to
// re-check. The decision comes from asking Apple's App Store Server API directly
// (../_shared/apple.ts). Only if Apple itself says the purchase was refunded or revoked does
// the server call glydrift_revoke_purchase. That function marks the purchase revoked, so
// RESTORE stops returning it, and takes its paid hero and title off the public leaderboard.
//
// Deploy without JWT checks (Apple doesn't send a Supabase session):
//   supabase functions deploy appstore-notifications --no-verify-jwt
// Then in App Store Connect → Glydrift → App Information → App Store Server Notifications, set
// the Production and Sandbox URL to https://<project-ref>.supabase.co/functions/v1/appstore-notifications
// and choose Version 2.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeJwt } from "npm:jose@5";
import { fetchTransaction, reply } from "../_shared/apple.ts";

function hintedTransactionId(signedPayload: unknown): string | null {
  if (typeof signedPayload !== "string") return null;
  try {
    const payload = decodeJwt(signedPayload) as { data?: { signedTransactionInfo?: string } };
    const info = payload?.data?.signedTransactionInfo;
    if (typeof info !== "string") return null;
    const id = String((decodeJwt(info) as { transactionId?: unknown }).transactionId ?? "");
    return /^[0-9]{1,32}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: false }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const id = hintedTransactionId((body as { signedPayload?: unknown }).signedPayload);
    // 200 for anything we can't use, so Apple doesn't keep retrying junk
    if (!id) return reply({ ok: true, ignored: true });

    const found = await fetchTransaction(id);
    if (!found || found.tx.bundleId !== Deno.env.get("APPSTORE_BUNDLE_ID"))
      return reply({ ok: true, ignored: true });
    if (!found.tx.revocationDate) return reply({ ok: true, revoked: false });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    for (const txId of new Set([
      String(found.tx.transactionId),
      String(found.tx.originalTransactionId ?? found.tx.transactionId),
    ])) {
      const { error } = await admin.rpc("glydrift_revoke_purchase", { tx_id: txId });
      if (error) throw error;
    }
    return reply({ ok: true, revoked: true });
  } catch (err) {
    console.error(err);
    // 500 makes Apple retry later (it retries for several days)
    return reply({ ok: false }, 500);
  }
});
