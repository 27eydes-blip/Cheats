/* GET /api/config — public, non-secret settings the browser needs.
   The Turnstile SITE key is public by design; the SECRET key never leaves the server. */
import { json } from "../../lib/http.js";

export function onRequestGet({ env }) {
  return json(
    { turnstileSiteKey: env.TURNSTILE_SITE_KEY || null },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "GET" });
}
