/* POST /api/chat/contact — a visitor chose to share their name and email in the chat
   and ticked the consent box. Marks the session as a lead to follow up (kept past 30 days). */
import { bodyError, isSameOrigin, json, readBody } from "../../../lib/http.js";
import { EMAIL_RE } from "../../../lib/email.js";
import { rateLimitSubject } from "../../../lib/ip.js";
import { rateLimited } from "../../../lib/ratelimit.js";
import { saveContact } from "../../../lib/chat/log.js";
import { cleanStartPage, cleanText, validSessionId } from "../../../lib/chat/validate.js";

const LIMIT = { max: 5, windowSec: 3600 };

export async function handleContact(request, env) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, { name: "chat-contact", subject: rateLimitSubject(ip), ...LIMIT })) {
    return json({ ok: false, error: "Too many tries. Please use the contact page instead." }, 429, { "Retry-After": String(LIMIT.windowSec) });
  }
  const { body, error } = await readBody(request, { maxBytes: 4096 });
  if (error) return bodyError(error);
  if (!validSessionId(body.sessionId)) return json({ ok: false, error: "Please refresh the page and start a new chat." }, 400);

  const name = cleanText(body.name).replace(/\s+/g, " ");
  const email = cleanText(body.email).toLowerCase();
  const fields = {};
  if (name.length < 1 || name.length > 100) fields.name = "Please enter your name.";
  if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = "Please enter a valid email address.";
  if (body.consent !== true) fields.consent = "Please tick the box so we're allowed to contact you.";
  if (Object.keys(fields).length) return json({ ok: false, error: "Please check the highlighted fields.", fields }, 422);

  if (!env.CHAT_DB) return json({ ok: false, error: "We couldn't save that right now. Please use the contact page." }, 503);
  const saved = await saveContact(env.CHAT_DB, { sessionId: body.sessionId, startPage: cleanStartPage(body.startPage), name, email });
  if (!saved) return json({ ok: false, error: "We couldn't save that right now. Please use the contact page." }, 502);
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  try {
    return await handleContact(request, env);
  } catch (err) {
    console.error("Unhandled chat contact error", err);
    return json({ ok: false, error: "Something went wrong. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
