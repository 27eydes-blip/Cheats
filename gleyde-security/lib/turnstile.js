/* Server-side Cloudflare Turnstile verification. */
import { allowedOrigins } from "./http.js";

/* Cloudflare's published test secrets (always pass; used in local development). */
const TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

/* True only if Cloudflare confirms the token AND it was solved on this site for `action`. */
export async function verifyTurnstile(env, request, token, ip, action) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return false;
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = await res.json();
    if (out?.success !== true) return false;
    if (TEST_SECRETS.has(secret)) return true; // test keys return placeholder hostname/action
    const hosts = new Set([...allowedOrigins(request, env)].map((o) => {
      try { return new URL(o).hostname; } catch { return ""; }
    }));
    return out.action === action && hosts.has(out.hostname);
  } catch (err) {
    console.error("Turnstile verify failed", err);
    return false;
  }
}
