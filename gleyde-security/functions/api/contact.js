/* POST /api/contact — contact form handler (Cloudflare Pages Function).

   Defences, in order:
     1. Same-origin check (blocks cross-site form posts)
     2. Per-IP rate limit, counted on EVERY post (malformed ones too):
        in-memory (catches parallel bursts) + KV (spans isolates/time).
        IPv6 is limited per /64, since one user controls a whole /64.
        Pair with the Cloudflare WAF rate-limit rule in the README.
     3. Streaming size cap, content-type allow-list, strict JSON shape
     4. Honeypot field + required minimum fill time (silently drops simple bots)
     5. Server-side validation: strings only, control/bidi chars stripped
     6. Cloudflare Turnstile, verified server-side incl. hostname and action
     7. Email via Resend: plain text, fixed subject, user input never in headers
   Any unexpected error returns a generic 500 with security headers, never a stack trace.

   All secrets come from environment variables — see .dev.vars.example. */
import { SECURITY_HEADERS, bodyError, isSameOrigin, json, readBody } from "../../lib/http.js";
import { rateLimitSubject } from "../../lib/ip.js";
import { rateLimited } from "../../lib/ratelimit.js";
import { verifyTurnstile } from "../../lib/turnstile.js";

// Re-exported for the tests.
export { rateLimitSubject } from "../../lib/ip.js";
export { _resetRateLimitMemory } from "../../lib/ratelimit.js";

const MAX_BODY_BYTES = 16 * 1024;
const MIN_FILL_MS = 3000;
const RATE_LIMIT = { max: 5, windowSec: 60 * 60 }; // 5 posts per IP (or IPv6 /64) per hour
const LIMITS = { name: 100, email: 254, website: 200, message: 4000 };

/* C0/C1 controls, DEL, zero-width chars, bidi overrides/isolates, line/paragraph
   separators, BOM. The message keeps \n and \t. */
const STRIP_SINGLE_LINE = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;
const STRIP_MULTI_LINE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

/* Only plain strings are accepted; objects/arrays/numbers become "" and fail validation. */
const str = (v) => (typeof v === "string" ? v : "");
const clean = (v, multiLine = false) =>
  str(v)
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(multiLine ? STRIP_MULTI_LINE : STRIP_SINGLE_LINE, "")
    .trim();

export function validate(raw) {
  const data = {
    name: clean(raw.name),
    email: clean(raw.email).toLowerCase(),
    website: clean(raw.website),
    message: clean(raw.message, true),
    consent: raw.consent === true || raw.consent === "on" || raw.consent === "true",
  };
  const fields = {};

  if (data.name.length < 2) fields.name = "Please enter your name (at least 2 characters).";
  else if (data.name.length > LIMITS.name) fields.name = `Please shorten your name to ${LIMITS.name} characters or fewer.`;

  if (
    data.email.length > LIMITS.email ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(data.email)
  ) {
    fields.email = "Please enter a valid email address, like name@yourbusiness.com.";
  }

  if (data.website) {
    let normalized = null;
    if (data.website.length <= LIMITS.website) {
      try {
        const u = new URL(/^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`);
        if (/^https?:$/.test(u.protocol) && u.hostname.includes(".") && !u.username && !u.password) {
          normalized = u.href;
        }
      } catch {
        /* invalid */
      }
    }
    // The URL is only ever printed as text in an email; the server never fetches it (no SSRF).
    if (normalized) data.website = normalized;
    else fields.website = "Please enter a valid website address, like yourbusiness.com, or leave it blank.";
  }

  if (data.message.length < 10) fields.message = "Please tell us a little more (at least 10 characters).";
  else if (data.message.length > LIMITS.message) fields.message = `Please keep your message under ${LIMITS.message} characters.`;

  if (!data.consent) fields.consent = "Please tick this box so we can reply to you.";

  return { data, fields };
}

/* ----- Email ----- */

async function sendEmail(env, data, meta) {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    console.error("Email env vars missing (RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL)");
    return false;
  }
  const text = [
    "New inquiry from the Gleyde website",
    "",
    `Name:    ${data.name}`,
    `Email:   ${data.email}`,
    `Website: ${data.website || "(not provided)"}`,
    "",
    "Message:",
    data.message,
    "",
    "—",
    `Received: ${meta.time}`,
    `Country:  ${meta.country || "unknown"}`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL.split(",").map((s) => s.trim()),
      reply_to: data.email, // validated address only
      subject: "New website inquiry", // fixed: no user input in headers
      text, // plain text only: no HTML, so nothing in the message can render as markup
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

function respond(request, status, body) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) return json(body, status);
  // Plain HTML form post (no JS): send the visitor back to a fixed path (no open redirect).
  const location = `/contact?status=${body.ok ? "sent" : "error"}`;
  return new Response(null, { status: 303, headers: { Location: location, ...SECURITY_HEADERS } });
}

async function handle(request, env) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, { name: "contact", subject: rateLimitSubject(ip), ...RATE_LIMIT })) {
    return json(
      { ok: false, error: "You've sent several messages in the past hour. Please wait an hour and try again." },
      429,
      { "Retry-After": String(RATE_LIMIT.windowSec) },
    );
  }

  const { body, error } = await readBody(request, { maxBytes: MAX_BODY_BYTES, allowForm: true });
  if (error) return bodyError(error);

  // Bots: pretend success so they don't adapt. The fill-time stamp is required.
  const started = Number(str(body.started_at));
  if (clean(body.company_fax) !== "" || !Number.isFinite(started) || started <= 0 || Date.now() - started < MIN_FILL_MS) {
    return respond(request, 200, { ok: true });
  }

  const { data, fields } = validate(body);
  if (Object.keys(fields).length) {
    return respond(request, 422, { ok: false, error: "Please fix the highlighted fields and try again.", fields });
  }

  if (!(await verifyTurnstile(env, request, body["cf-turnstile-response"], ip, "contact"))) {
    return respond(request, 403, { ok: false, error: "We couldn't confirm you're not a bot. Please complete the verification above the button again, then press Send." });
  }

  const sent = await sendEmail(env, data, { time: new Date().toISOString(), country: request.cf?.country });
  if (!sent) {
    return respond(request, 502, { ok: false, error: "We couldn't send your message just now. Please try again in a few minutes." });
  }
  return respond(request, 200, { ok: true });
}

export async function onRequestPost({ request, env }) {
  try {
    return await handle(request, env);
  } catch (err) {
    console.error("Unhandled contact error", err);
    return json({ ok: false, error: "Something went wrong on our side. Please try again in a few minutes." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
