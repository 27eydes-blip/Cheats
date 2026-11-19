// Supabase Edge Function: revoke a player's Sign in with Apple token when they delete their
// account (App Store Review Guideline 5.1.1(v): apps that offer Sign in with Apple must revoke
// its tokens on account deletion).
//
// The app (iOS only, just before "Delete my account" deletes everything) asks Apple for a fresh
// one-time authorization code with the Sign in with Apple sheet and sends it here with the
// player's session: { authorizationCode }. This function trades the code for the player's token
// at Apple and revokes it, so the app disappears from the player's Apple ID ("Sign in with
// Apple" in iPhone Settings). No Apple token is ever stored anywhere.
//
// Secrets (Supabase → Edge Functions → Secrets), from developer.apple.com → Keys (a key with
// "Sign in with Apple" ticked; it can be the same key as for the Supabase Apple provider):
//   APPLE_TEAM_ID              your 10-character Team ID
//   APPLE_SIGNIN_KEY_ID        the key's 10-character Key ID
//   APPLE_SIGNIN_PRIVATE_KEY   the .p8 file's contents
//   APPLE_SIGNIN_CLIENT_ID     optional, default com.glydrift.game (the app's bundle ID)
// Until they're set it answers { revoked: false, reason: "not-configured" } and the game deletes
// the account anyway (a deletion must never get stuck).
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const APPLE = "https://appleid.apple.com";
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

/** The client secret Apple's token endpoints want: a short-lived JWT signed with the .p8 key. */
async function clientSecret(clientId: string): Promise<string> {
  const key = await importPKCS8(Deno.env.get("APPLE_SIGNIN_PRIVATE_KEY")!, "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: Deno.env.get("APPLE_SIGNIN_KEY_ID")! })
    .setIssuer(Deno.env.get("APPLE_TEAM_ID")!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(APPLE)
    .setSubject(clientId)
    .sign(key);
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply("ok");
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  // the caller must be a signed-in player whose account uses Sign in with Apple
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: who, error: whoErr } = await sb.auth.getUser(jwt);
  if (whoErr || !who?.user) return reply({ error: "not signed in" }, 401);
  const providers: string[] = who.user.app_metadata?.providers || [];
  if (!providers.includes("apple")) return reply({ revoked: false, reason: "not-apple" });

  let code = "";
  try {
    code = String((await req.json())?.authorizationCode || "");
  } catch {
    /* no body */
  }
  if (!/^[A-Za-z0-9._-]{10,512}$/.test(code)) return reply({ error: "authorizationCode missing" }, 400);

  for (const k of ["APPLE_TEAM_ID", "APPLE_SIGNIN_KEY_ID", "APPLE_SIGNIN_PRIVATE_KEY"])
    if (!Deno.env.get(k)) return reply({ revoked: false, reason: "not-configured" });
  const clientId = Deno.env.get("APPLE_SIGNIN_CLIENT_ID") || "com.glydrift.game";

  try {
    const secret = await clientSecret(clientId);
    // 1. the one-time code → the player's tokens
    const tok = await fetch(`${APPLE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" }),
    });
    const tokens = await tok.json().catch(() => ({}));
    if (!tok.ok) return reply({ revoked: false, reason: `apple-token ${tok.status}`, detail: tokens?.error || "" }, 502);
    const token = tokens.refresh_token || tokens.access_token;
    const hint = tokens.refresh_token ? "refresh_token" : "access_token";
    if (!token) return reply({ revoked: false, reason: "apple-token-empty" }, 502);
    // 2. revoke it: the app leaves the player's Apple ID
    const rev = await fetch(`${APPLE}/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ client_id: clientId, client_secret: secret, token, token_type_hint: hint }),
    });
    if (!rev.ok) return reply({ revoked: false, reason: `apple-revoke ${rev.status}` }, 502);
    return reply({ revoked: true });
  } catch (e) {
    return reply({ revoked: false, reason: "error", detail: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
