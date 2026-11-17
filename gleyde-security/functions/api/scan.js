/* POST /api/scan — free, passive Website Security Check.

   Defences, in order:
     1. Same-origin check
     2. Per-visitor rate limit (10 checks/hour per IP or IPv6 /64), counted on every post
     3. 2 KB JSON body cap, strict shape
     4. Domain validation: public domain names only (no IPs, ports, credentials, reserved names)
     5. Consent checkbox + Cloudflare Turnstile (action "scan"), verified server-side
     6. Per-target limit: results cached 15 min, and at most 3 fresh checks of one domain
        per 15 min from everyone combined, so this can't be used to hammer someone's site
     7. SSRF guard inside the scanner (every hop resolved and checked for public IPs)
   The scanner only makes passive GET requests and DNS lookups — see lib/scanner.js. */
import { bodyError, isSameOrigin, json, readBody } from "../../lib/http.js";
import { rateLimitSubject } from "../../lib/ip.js";
import { rateLimited } from "../../lib/ratelimit.js";
import { ScanError, normalizeDomain, runScan } from "../../lib/scanner.js";
import { verifyTurnstile } from "../../lib/turnstile.js";

const VISITOR_LIMIT = { max: 10, windowSec: 60 * 60 };
const TARGET_LIMIT = { max: 3, windowSec: 15 * 60 };
const CACHE_TTL = 15 * 60;

async function handle(request, env) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, { name: "scan", subject: rateLimitSubject(ip), ...VISITOR_LIMIT })) {
    return json({ ok: false, error: "You've run several checks recently. Please try again in an hour." }, 429,
      { "Retry-After": String(VISITOR_LIMIT.windowSec) });
  }

  const { body, error } = await readBody(request, { maxBytes: 2048 });
  if (error) return bodyError(error);

  const { host, error: domainError } = normalizeDomain(body.domain);
  if (domainError) return json({ ok: false, error: domainError, fields: { domain: domainError } }, 422);
  if (body.consent !== true && body.consent !== "true" && body.consent !== "on") {
    const msg = "Please confirm this is your website (or you're allowed to check it).";
    return json({ ok: false, error: msg, fields: { consent: msg } }, 422);
  }

  if (!(await verifyTurnstile(env, request, body["cf-turnstile-response"], ip, "scan"))) {
    return json({ ok: false, error: "Verification failed. Please try the check again." }, 403);
  }

  const cacheKey = `scan:v1:${host}`;
  if (env.RATE_LIMIT_KV) {
    const cached = await env.RATE_LIMIT_KV.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return json({ ok: true, cached: true, report: JSON.parse(cached) });
      } catch {
        /* ignore a corrupt cache entry */
      }
    }
  }

  if (await rateLimited(env, { name: "scan-target", subject: host, ...TARGET_LIMIT })) {
    return json({ ok: false, error: "That website was checked a few minutes ago. Please try again in 15 minutes." }, 429,
      { "Retry-After": String(TARGET_LIMIT.windowSec) });
  }

  let report;
  try {
    const origin = new URL(request.url).origin;
    report = await runScan(host, { userAgent: `GleydeSecurityCheck/1.0 (passive; +${origin}/security-check)` });
  } catch (err) {
    if (err instanceof ScanError) {
      const status = err.code === "dns" || err.code === "budget" ? 502 : 422;
      return json({ ok: false, error: err.message, fields: { domain: err.message } }, status);
    }
    throw err;
  }

  if (env.RATE_LIMIT_KV) {
    await env.RATE_LIMIT_KV.put(cacheKey, JSON.stringify(report), { expirationTtl: CACHE_TTL }).catch(() => {});
  }
  return json({ ok: true, cached: false, report });
}

export async function onRequestPost({ request, env }) {
  try {
    return await handle(request, env);
  } catch (err) {
    console.error("Unhandled scan error", err);
    return json({ ok: false, error: "Something went wrong running the check. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
