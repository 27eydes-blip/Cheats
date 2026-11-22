/* POST /api/deep-scan — owner-verified checks (lib/scan/deep.js).
   Requires: same origin, rate limits, Turnstile, and proof of control of the domain
   (DNS TXT record or file with the code from /api/verify). Read-only GET requests only. */
import { bodyError, isSameOrigin, json, readBody } from "../../lib/http.js";
import { rateLimitSubject } from "../../lib/ip.js";
import { rateLimited } from "../../lib/ratelimit.js";
import { enrich } from "../../lib/scan/advice.js";
import { checkOwnership, runDeepScan, verificationCode, verificationInstructions } from "../../lib/scan/deep.js";
import { Ctx } from "../../lib/scan/net.js";
import { normalizeDomain } from "../../lib/scanner.js";
import { verifyTurnstile } from "../../lib/turnstile.js";

async function handle(request, env) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);
  const secret = env.VERIFY_SECRET || env.RATE_LIMIT_SALT;
  if (!secret) return json({ ok: false, error: "Owner verification isn't set up yet." }, 503);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, { name: "deep", subject: rateLimitSubject(ip), max: 6, windowSec: 3600 })) {
    return json({ ok: false, error: "You've run several verified checks recently. Please try again in an hour." }, 429);
  }
  const { body, error } = await readBody(request, { maxBytes: 2048 });
  if (error) return bodyError(error);
  const { host, error: domainError } = normalizeDomain(body.domain);
  if (domainError) return json({ ok: false, error: domainError }, 422);

  if (!(await verifyTurnstile(env, request, body["cf-turnstile-response"], ip, "scan"))) {
    return json({ ok: false, error: "Verification failed. Please try again." }, 403);
  }
  if (await rateLimited(env, { name: "deep-target", subject: host, max: 4, windowSec: 900 })) {
    return json({ ok: false, error: "That website was checked a few minutes ago. Please try again in 15 minutes." }, 429);
  }

  const origin = new URL(request.url).origin;
  const userAgent = `GleydeSecurityCheck/1.0 (owner-verified; +${origin}/security-check)`;
  const code = await verificationCode(secret, host);
  const via = await checkOwnership(new Ctx(userAgent), host, code);
  if (!via) {
    return json({
      ok: false,
      error: "We couldn't find your verification code yet. DNS changes can take a few minutes (sometimes up to an hour) to show up.",
      ...verificationInstructions(host, code),
    }, 403);
  }

  const section = await runDeepScan(host, { userAgent });
  if (!section) return json({ ok: false, error: "We couldn't reach that domain right now." }, 502);
  enrich(section.checks, { cms: null, cdn: null, web: null }, { emailDomain: host });
  return json({ ok: true, domain: host, verifiedVia: via, section });
}

export async function onRequestPost({ request, env }) {
  try {
    return await handle(request, env);
  } catch (err) {
    console.error("Unhandled deep-scan error", err);
    return json({ ok: false, error: "Something went wrong. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
