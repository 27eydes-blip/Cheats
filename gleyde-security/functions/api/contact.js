/* POST /api/contact — contact form handler (Cloudflare Pages Function).

   Defences, in order:
     1. Method, size and content-type checks
     2. Same-origin check (blocks cross-site form posts)
     3. Per-IP rate limit (KV) — pair this with a Cloudflare WAF rate-limit rule
     4. Honeypot field + minimum fill time (silently drops simple bots)
     5. Server-side validation of every field (never trust the browser)
     6. Cloudflare Turnstile verification (server-side, with the secret key)
     7. Email delivery via Resend, plain text only, user input never in headers

   All secrets come from environment variables — see .dev.vars.example. */
import { SECURITY_HEADERS, json } from "../../lib/http.js";

const MAX_BODY_BYTES = 16 * 1024;
const MIN_FILL_MS = 3000;
const RATE_LIMIT = { max: 5, windowSec: 60 * 60 }; // 5 messages per IP per hour
const LIMITS = { name: 100, email: 254, website: 200, message: 4000 };

/* Strip control characters (keeps newlines/tabs in the message only). */
const clean = (v, allowNewlines = false) =>
  String(v ?? "")
    .normalize("NFC")
    .replace(allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g
                           : /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .trim();

export function validate(raw) {
  const data = {
    name: clean(raw.name),
    email: clean(raw.email).toLowerCase(),
    website: clean(raw.website),
    message: clean(raw.message, true).replace(/\r\n?/g, "\n"),
    consent: raw.consent === true || raw.consent === "on" || raw.consent === "true",
  };
  const fields = {};

  if (data.name.length < 2) fields.name = "Please enter your name.";
  else if (data.name.length > LIMITS.name) fields.name = "Name is too long.";

  if (
    data.email.length > LIMITS.email ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(data.email)
  ) {
    fields.email = "Please enter a valid email address.";
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
    if (normalized) data.website = normalized;
    else fields.website = "Please enter a valid website address.";
  }

  if (data.message.length < 10) fields.message = "Please tell us a little more (10+ characters).";
  else if (data.message.length > LIMITS.message) fields.message = `Please keep it under ${LIMITS.message} characters.`;

  if (!data.consent) fields.consent = "Please confirm so we can reply to you.";

  return { data, fields };
}

async function readBody(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY_BYTES) return { error: 413 };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { error: 413 };

  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type === "application/json") {
    try {
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? { body: obj } : { error: 400 };
    } catch {
      return { error: 400 };
    }
  }
  if (type === "application/x-www-form-urlencoded") {
    return { body: Object.fromEntries(new URLSearchParams(text)) };
  }
  return { error: 415 };
}

function isSameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const self = new URL(request.url).origin;
  const allowed = new Set([self, ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  if (origin) return allowed.has(origin);
  // No Origin header (rare for modern browsers on POST): fall back to Sec-Fetch-Site.
  const site = request.headers.get("Sec-Fetch-Site");
  return !site || site === "same-origin";
}

async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/* Fixed-window counter in KV. KV is eventually consistent, so this is a soft
   limit; the Cloudflare WAF rate-limiting rule in the README is the hard one. */
async function rateLimited(env, ip) {
  if (!env.RATE_LIMIT_KV) return false;
  const windowId = Math.floor(Date.now() / 1000 / RATE_LIMIT.windowSec);
  const key = `rl:${await hashIp(ip, env.RATE_LIMIT_SALT || "gleyde")}:${windowId}`;
  const count = Number((await env.RATE_LIMIT_KV.get(key)) || 0);
  if (count >= RATE_LIMIT.max) return true;
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT.windowSec + 60 });
  return false;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return false;
  }
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = await res.json();
    return out.success === true && (!out.action || out.action === "contact");
  } catch (err) {
    console.error("Turnstile verify failed", err);
    return false;
  }
}

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
      text,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

function respond(request, status, body) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) return json(body, status);
  // Plain HTML form post (no JS): send the visitor back to the page.
  const url = new URL("/contact", request.url);
  url.searchParams.set("status", body.ok ? "sent" : "error");
  return new Response(null, { status: 303, headers: { Location: url.pathname + url.search, ...SECURITY_HEADERS } });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);

  const { body, error } = await readBody(request);
  if (error === 413) return json({ ok: false, error: "Message is too large." }, 413);
  if (error === 415) return json({ ok: false, error: "Unsupported content type." }, 415);
  if (error) return json({ ok: false, error: "Malformed request." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "";

  if (await rateLimited(env, ip)) {
    return json(
      { ok: false, error: "You have sent several messages recently. Please try again in an hour." },
      429,
      { "Retry-After": String(RATE_LIMIT.windowSec) },
    );
  }

  // Bots: pretend success so they don't adapt.
  const started = Number(body.started_at);
  if (clean(body.company_fax) !== "" || (Number.isFinite(started) && Date.now() - started < MIN_FILL_MS)) {
    return respond(request, 200, { ok: true });
  }

  const { data, fields } = validate(body);
  if (Object.keys(fields).length) {
    return respond(request, 422, { ok: false, error: "Please fix the highlighted fields.", fields });
  }

  if (!(await verifyTurnstile(env, body["cf-turnstile-response"], ip))) {
    return respond(request, 403, { ok: false, error: "Verification failed. Please try the check again." });
  }

  const sent = await sendEmail(env, data, {
    time: new Date().toISOString(),
    country: request.cf?.country,
  });
  if (!sent) {
    return respond(request, 502, {
      ok: false,
      error: "We could not send your message right now. Please try again shortly.",
    });
  }
  return respond(request, 200, { ok: true });
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
