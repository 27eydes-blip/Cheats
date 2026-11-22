/* POST /api/chat/delete — "Delete my chat". The random session id, which only the
   visitor's browser holds, is what authorises deleting that one conversation. */
import { bodyError, isSameOrigin, json, readBody } from "../../../lib/http.js";
import { rateLimitSubject } from "../../../lib/ip.js";
import { rateLimited } from "../../../lib/ratelimit.js";
import { deleteSession } from "../../../lib/chat/log.js";
import { validSessionId } from "../../../lib/chat/validate.js";

const LIMIT = { max: 20, windowSec: 3600 };

export async function handleDelete(request, env) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, { name: "chat-delete", subject: rateLimitSubject(ip), ...LIMIT })) {
    return json({ ok: false, error: "Too many tries. Please try again later." }, 429, { "Retry-After": String(LIMIT.windowSec) });
  }
  const { body, error } = await readBody(request, { maxBytes: 1024 });
  if (error) return bodyError(error);
  if (!validSessionId(body.sessionId)) return json({ ok: false, error: "Malformed request." }, 400);
  if (!env.CHAT_DB) return json({ ok: true }); // nothing was ever stored
  const ok = await deleteSession(env.CHAT_DB, body.sessionId);
  return ok ? json({ ok: true }) : json({ ok: false, error: "We couldn't delete it just now. Please try again." }, 502);
}

export async function onRequestPost({ request, env }) {
  try {
    return await handleDelete(request, env);
  } catch (err) {
    console.error("Unhandled chat delete error", err);
    return json({ ok: false, error: "Something went wrong. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
