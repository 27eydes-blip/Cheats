/* POST /api/verify — gives a site owner the code that proves they control their domain.
   Stateless: the code is an HMAC of the domain with a server secret (lib/scan/deep.js).
   No outbound requests happen here. */
import { bodyError, isSameOrigin, json, readBody } from "../../lib/http.js";
import { rateLimitSubject } from "../../lib/ip.js";
import { rateLimited } from "../../lib/ratelimit.js";
import { verificationCode, verificationInstructions } from "../../lib/scan/deep.js";
import { normalizeDomain } from "../../lib/scanner.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);
    const secret = env.VERIFY_SECRET || env.RATE_LIMIT_SALT;
    if (!secret) return json({ ok: false, error: "Owner verification isn't set up yet." }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    if (await rateLimited(env, { name: "verify", subject: rateLimitSubject(ip), max: 30, windowSec: 3600 })) {
      return json({ ok: false, error: "Too many requests. Please try again later." }, 429);
    }
    const { body, error } = await readBody(request, { maxBytes: 1024 });
    if (error) return bodyError(error);
    const { host, error: domainError } = normalizeDomain(body.domain);
    if (domainError) return json({ ok: false, error: domainError }, 422);
    const code = await verificationCode(secret, host);
    return json({ ok: true, domain: host, ...verificationInstructions(host, code) });
  } catch (err) {
    console.error("Unhandled verify error", err);
    return json({ ok: false, error: "Something went wrong. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
