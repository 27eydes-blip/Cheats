/* gleyde-chat-mailer \u2014 scheduled Worker (no HTTP routes).
   Every 15 minutes: find chats idle for 15+ minutes that have not been emailed,
   send one transcript email per chat to OWNER_EMAIL via Resend, mark them emailed.
   Daily: delete chats older than 30 days unless the visitor asked us to follow up.
   Secrets: RESEND_API_KEY, OWNER_EMAIL. Var: MAIL_FROM. Binding: CHAT_DB (D1). */

export const IDLE_MS = 15 * 60 * 1000;
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 25;

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* One line, no control characters: safe to place in a subject or a single text line. */
const oneLine = (s, max = 200) => String(s ?? "").replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").trim().slice(0, max);

export const formatTime = (ms) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ms));

const WHO = { user: "Visitor", assistant: "Gleyde AI", system: "Note" };

export function buildEmail(session, messages) {
  const started = formatTime(session.created_at);
  const page = oneLine(session.start_page || "(unknown)", 120);
  const lead = session.contact_email
    ? `Lead: ${oneLine(session.contact_name || "(no name given)", 100)} <${oneLine(session.contact_email, 254)}>${session.follow_up ? " (asked for follow-up)" : ""}`
    : "Lead: none (visitor did not share contact details)";

  const text = [
    `Chat started: ${started}`,
    `Starting page: ${page}`,
    lead,
    `Chat ID: ${session.id}`,
    "",
    "Transcript",
    "----------",
    ...messages.map((m) => `[${formatTime(m.created_at)}] ${WHO[m.role] || "?"}: ${m.content}`),
    "",
    "Secrets that looked like passwords, keys or card numbers were replaced with [redacted] before saving.",
  ].join("\n");

  const rows = messages
    .map(
      (m) => `<tr><td style="padding:8px 10px;vertical-align:top;color:#8f8a81;white-space:nowrap;font-size:12px">${escapeHtml(formatTime(m.created_at))}</td>` +
        `<td style="padding:8px 10px;vertical-align:top;font-weight:600;white-space:nowrap;color:${m.role === "user" ? "#7a5a1e" : "#333"}">${escapeHtml(WHO[m.role] || "?")}</td>` +
        `<td style="padding:8px 10px;vertical-align:top;white-space:pre-wrap">${escapeHtml(m.content)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f4ef;font-family:Arial,sans-serif;color:#111">
<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2dccf;border-radius:10px;padding:24px">
<h1 style="margin:0 0 12px;font-size:20px">Website chat transcript</h1>
<p style="margin:0 0 4px"><strong>Started:</strong> ${escapeHtml(started)}</p>
<p style="margin:0 0 4px"><strong>Starting page:</strong> ${escapeHtml(page)}</p>
<p style="margin:0 0 16px;padding:10px 12px;background:${session.contact_email ? "#fbf3df" : "#f3f3f3"};border-radius:6px"><strong>${escapeHtml(lead)}</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.45">${rows}</table>
<p style="margin:16px 0 0;font-size:12px;color:#666">Chat ID ${escapeHtml(session.id)}. Things that looked like passwords, keys or card numbers were replaced with [redacted] before saving.</p>
</div></body></html>`;

  const subject = session.contact_email
    ? `Chat lead: ${oneLine(session.contact_name || session.contact_email, 80)}`
    : `Website chat (${session.message_count} messages)`;
  return { subject, text, html };
}

async function sendResend(env, mail, fetchImpl = fetch) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: String(env.OWNER_EMAIL).split(",").map((s) => s.trim()).filter(Boolean),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export async function emailIdleSessions(env, { now = Date.now(), fetchImpl } = {}) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL || !env.MAIL_FROM) {
    console.error("chat-mailer: RESEND_API_KEY, OWNER_EMAIL and MAIL_FROM must be set");
    return { sent: 0, failed: 0 };
  }
  const { results: sessions } = await env.CHAT_DB.prepare(
    `SELECT * FROM chat_sessions WHERE emailed_at IS NULL AND last_activity_at <= ?1 AND message_count > 0
     ORDER BY last_activity_at LIMIT ?2`,
  ).bind(now - IDLE_MS, BATCH).all();

  let sent = 0;
  let failed = 0;
  for (const s of sessions) {
    try {
      const { results: messages } = await env.CHAT_DB.prepare(
        "SELECT role, content, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY id",
      ).bind(s.id).all();
      if (!messages.length) continue;
      if (await sendResend(env, buildEmail(s, messages), fetchImpl)) {
        // Only mark it if nothing new arrived meanwhile; a newer message gets its own email later.
        await env.CHAT_DB.prepare("UPDATE chat_sessions SET emailed_at = ?1 WHERE id = ?2 AND last_activity_at = ?3")
          .bind(now, s.id, s.last_activity_at).run();
        sent++;
      } else failed++;
    } catch (err) {
      console.error("chat-mailer: session failed", err);
      failed++;
    }
  }
  return { sent, failed };
}

export async function purgeOldSessions(env, { now = Date.now() } = {}) {
  const cutoff = now - RETENTION_MS;
  await env.CHAT_DB.prepare(
    "DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE created_at < ?1 AND follow_up = 0)",
  ).bind(cutoff).run();
  const res = await env.CHAT_DB.prepare("DELETE FROM chat_sessions WHERE created_at < ?1 AND follow_up = 0").bind(cutoff).run();
  return { deleted: res.meta?.changes ?? 0 };
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "23 4 * * *") ctx.waitUntil(purgeOldSessions(env).then((r) => console.log("purged", r.deleted)));
    else ctx.waitUntil(emailIdleSessions(env).then((r) => console.log("emailed", r.sent, "failed", r.failed)));
  },
};
