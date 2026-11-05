// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE.
//
// Shared by the Edge Functions: ask Apple's App Store Server API about a transaction.
// The answer is fetched straight from Apple over TLS with your In-App Purchase key, so it is
// Apple's own word. Nothing a player sends is ever trusted on its own.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   APPSTORE_ISSUER_ID, APPSTORE_KEY_ID, APPSTORE_PRIVATE_KEY (the .p8 file's contents),
//   APPSTORE_BUNDLE_ID (the app's bundle ID, e.g. com.eyde.glydrift)
import { decodeJwt, importPKCS8, SignJWT } from "npm:jose@5";

export const APPLE = {
  Production: "https://api.storekit.itunes.apple.com",
  Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
} as const;
export type AppleEnv = keyof typeof APPLE;

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const reply = (body: unknown, status = 200) =>
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

/** Ask Apple for a transaction: production first, then the sandbox (TestFlight / App Review). */
export async function fetchTransaction(
  id: string,
): Promise<{ env: AppleEnv; tx: Record<string, unknown> } | null> {
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
