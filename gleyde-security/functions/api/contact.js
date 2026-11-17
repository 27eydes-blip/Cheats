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
import { SECURITY_HEADERS, json } from "../../lib/http.js";

const MAX_BODY_BYTES = 16 * 1024;
const MIN_FILL_MS = 3000;
const RATE_LIMIT = { max: 5, windowSec: 60 * 60 }; // 5 posts per IP (or IPv6 /64) per hour
const LIMITS = { name: 100, email: 254, website: 200, message: 4000 };

/* Cloudflare's published Turnstile test secrets (always pass, used in local dev). */
const TURNSTILE_TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

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
    // The URL is only ever printed as text in an email; the server never fetches it (no SSRF).
    if (normalized) data.website = normalized;
    else fields.website = "Please enter a valid website address.";
  }

  if (data.message.length < 10) fields.message = "Please tell us a little more (10+ characters).";
  else if (data.message.length > LIMITS.message) fields.message = `Please keep it under ${LIMITS.message} characters.`;

  if (!data.consent) fields.consent = "Please confirm so we can reply to you.";

  return { data, fields };
}

/* Reads the body with a hard byte cap, even when Content-Length is absent (chunked)
   or wrong, so a huge upload can't exhaust memory. */
async function readCapped(request) {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function readBody(request) {
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json" && type !== "application/x-www-form-urlencoded") return { error: 415 };

  const text = await readCapped(request);
  if (text === null) return { error: 413 };

  if (type === "application/json") {
    try {
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? { body: obj } : { error: 400 };
    } catch {
      return { error: 400 };
    }
  }
  return { body: Object.fromEntries(new URLSearchParams(text)) };
}

function allowedOrigins(request, env) {
  return new Set([
    new URL(request.url).origin,
    ...String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  ]);
}

function isSameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (origin) return allowedOrigins(request, env).has(origin);
  // No Origin header: not a modern browser cross-site POST. Refuse if the browser says cross-site.
  const site = request.headers.get("Sec-Fetch-Site");
  return !site || site === "same-origin";
}

/* ----- Rate limiting ----- */

/* Turns an IP into the unit we limit on: the full IPv4 address, or the /64 network for
   IPv6 (one customer usually controls a whole /64). IPv4-mapped IPv6 maps back to IPv4. */
export function rateLimitSubject(ip) {
  const raw = String(ip || "").trim().toLowerCase();
  if (!raw) return "unknown";
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (!raw.includes(":")) return raw;

  let addr = raw.split("%")[0]; // drop zone id
  // Embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) -> two hex groups
  const v4 = addr.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    addr = addr.slice(0, v4.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const groups = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return `bad:${raw}`;
  return `${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

async function hashSubject(subject, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${subject}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/* Per-isolate counter. JS is single-threaded inside an isolate, so increments here are
   atomic and catch parallel bursts that would race past KV's read-then-write. */
const memory = { windowId: -1, counts: new Map() };
const MEMORY_MAX_KEYS = 10_000;
export function _resetRateLimitMemory() {
  memory.windowId = -1;
  memory.counts.clear();
}

function memoryHit(key, windowId) {
  if (memory.windowId !== windowId || memory.counts.size > MEMORY_MAX_KEYS) {
    memory.windowId = windowId;
    memory.counts.clear();
  }
  const n = (memory.counts.get(key) || 0) + 1;
  memory.counts.set(key, n);
  return n;
}

async function rateLimited(env, ip) {
  const windowId = Math.floor(Date.now() / 1000 / RATE_LIMIT.windowSec);
  const key = `rl:${await hashSubject(rateLimitSubject(ip), env.RATE_LIMIT_SALT || "gleyde")}:${windowId}`;

  if (memoryHit(key, windowId) > RATE_LIMIT.max) return true;

  if (!env.RATE_LIMIT_KV) return false;
  try {
    const count = Number((await env.RATE_LIMIT_KV.get(key)) || 0);
    if (count >= RATE_LIMIT.max) return true;
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT.windowSec + 60 });
  } catch (err) {
    // KV outage: fail open (memory limit, WAF rule and Turnstile still apply) rather than take the form down.
    console.error("Rate-limit KV error", err);
  }
  return false;
}

/* ----- Turnstile ----- */

async function verifyTurnstile(env, request, token, ip) {
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
    if (out.success !== true) return false;
    if (TURNSTILE_TEST_SECRETS.has(secret)) return true; // test keys return placeholder hostname/action
    // A token solved on another site, or for another widget, must not be accepted here.
    const hosts = new Set([...allowedOrigins(request, env)].map((o) => {
      try { return new URL(o).hostname; } catch { return ""; }
    }));
    return out.action === "contact" && hosts.has(out.hostname);
  } catch (err) {
    console.error("Turnstile verify failed", err);
    return false;
  }
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
  if (await rateLimited(env, ip)) {
    return json(
      { ok: false, error: "You have sent several messages recently. Please try again in an hour." },
      429,
      { "Retry-After": String(RATE_LIMIT.windowSec) },
    );
  }

  const { body, error } = await readBody(request);
  if (error === 413) return json({ ok: false, error: "Message is too large." }, 413);
  if (error === 415) return json({ ok: false, error: "Unsupported content type." }, 415);
  if (error) return json({ ok: false, error: "Malformed request." }, 400);

  // Bots: pretend success so they don't adapt. The fill-time stamp is required.
  const started = Number(str(body.started_at));
  if (clean(body.company_fax) !== "" || !Number.isFinite(started) || started <= 0 || Date.now() - started < MIN_FILL_MS) {
    return respond(request, 200, { ok: true });
  }

  const { data, fields } = validate(body);
  if (Object.keys(fields).length) {
    return respond(request, 422, { ok: false, error: "Please fix the highlighted fields.", fields });
  }

  if (!(await verifyTurnstile(env, request, body["cf-turnstile-response"], ip))) {
    return respond(request, 403, { ok: false, error: "Verification failed. Please try the check again." });
  }

  const sent = await sendEmail(env, data, { time: new Date().toISOString(), country: request.cf?.country });
  if (!sent) {
    return respond(request, 502, { ok: false, error: "We could not send your message right now. Please try again shortly." });
  }
  return respond(request, 200, { ok: true });
}

export async function onRequestPost({ request, env }) {
  try {
    return await handle(request, env);
  } catch (err) {
    console.error("Unhandled contact error", err);
    return json({ ok: false, error: "Something went wrong. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
