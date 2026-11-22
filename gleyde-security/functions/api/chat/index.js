/* POST /api/chat — the website's AI assistant (Cloudflare Pages Function).

   1. Same-origin check, then rate limits counted on every post: per visitor IP
      (20 messages / 10 min, IP only ever hashed), per chat session, and a daily site-wide cap.
   2. Size cap, strict JSON shape, message max 500 characters.
   3. Secrets (passwords, keys, tokens, card numbers) are redacted before the text
      reaches the model or the log, and the assistant is told to remind the visitor.
   4. The reply is plain text, capped in length. The browser renders it with textContent.
   5. Logging to D1 runs after the response (waitUntil) in lib/chat/log.js and
      swallows its own errors, so it can never break or slow down the reply.
   ANTHROPIC_API_KEY is a Cloudflare secret; it never reaches the browser. */
import { bodyError, isSameOrigin, json, readBody } from "../../../lib/http.js";
import { rateLimitSubject } from "../../../lib/ip.js";
import { rateLimited } from "../../../lib/ratelimit.js";
import { logTurn } from "../../../lib/chat/log.js";
import { redactSecrets } from "../../../lib/chat/redact.js";
import { generateReply } from "../../../lib/chat/reply.js";
import { MAX_MESSAGE_CHARS, cleanHistory, cleanStartPage, cleanText, validSessionId } from "../../../lib/chat/validate.js";

const MAX_BODY_BYTES = 48 * 1024;
const IP_LIMIT = { max: 20, windowSec: 600 };
const SESSION_LIMIT = { max: 40, windowSec: 24 * 3600 };

export async function handleChat(request, env, waitUntil, deps = {}) {
  if (!isSameOrigin(request, env)) return json({ ok: false, error: "Forbidden." }, 403);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (await rateLimited(env, { name: "chat", subject: rateLimitSubject(ip), ...IP_LIMIT })) {
    return json(
      { ok: false, error: "You're sending messages quickly. Take a breather and try again in a few minutes." },
      429,
      { "Retry-After": String(IP_LIMIT.windowSec) },
    );
  }

  const { body, error } = await readBody(request, { maxBytes: MAX_BODY_BYTES });
  if (error) return bodyError(error);

  if (!validSessionId(body.sessionId)) return json({ ok: false, error: "Please refresh the page and start a new chat." }, 400);

  const raw = cleanText(body.message);
  if (!raw) return json({ ok: false, error: "Type a message first." }, 422);
  if (raw.length > MAX_MESSAGE_CHARS) {
    return json({ ok: false, error: `Please keep messages under ${MAX_MESSAGE_CHARS} characters.` }, 422);
  }
  const history = cleanHistory(body.history);
  if (!history) return json({ ok: false, error: "Please refresh the page and start a new chat." }, 400);

  if (await rateLimited(env, { name: "chat-session", subject: body.sessionId, ...SESSION_LIMIT })) {
    return json({ ok: false, error: "This chat has reached its limit. For more help, book a free consult on the contact page." }, 429);
  }
  const dailyCap = Number(env.CHAT_DAILY_CAP) > 0 ? Number(env.CHAT_DAILY_CAP) : 500;
  if (await rateLimited(env, { name: "chat-global", subject: "all", max: dailyCap, windowSec: 24 * 3600 })) {
    return json({ ok: false, error: "The assistant is taking a break for today. You can still reach us on the contact page." }, 503);
  }

  // Redact the new message and anything the browser sent back from earlier turns.
  const { text: message, redacted } = redactSecrets(raw);
  const safeHistory = history.map((m) => (m.role === "user" ? { ...m, text: redactSecrets(m.text).text } : m));

  const result = await generateReply(env, { history: safeHistory, message, redacted }, deps);
  if (result.error) return json({ ok: false, error: result.error }, result.status);

  const log = logTurn(env.CHAT_DB, {
    sessionId: body.sessionId,
    startPage: cleanStartPage(body.startPage),
    firstTurn: history.length === 0,
    userText: message,
    assistantText: result.reply,
  });
  if (waitUntil) waitUntil(log);
  else await log;

  return json({ ok: true, reply: result.reply, redacted, ...(redacted ? { message } : {}) });
}

export async function onRequestPost(context) {
  try {
    return await handleChat(context.request, context.env, context.waitUntil?.bind(context));
  } catch (err) {
    console.error("Unhandled chat error", err);
    return json({ ok: false, error: "Something went wrong. Please try again later." }, 500);
  }
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
