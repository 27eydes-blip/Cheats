/* Sends plain-text email through Resend. Recipients and subject are built by our code
   from validated values only; nothing user-typed goes into headers unvalidated. */
export const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const emailConfigured = (env) => Boolean(env.RESEND_API_KEY && env.CONTACT_FROM_EMAIL);

export async function sendPlainEmail(env, { to, subject, text, replyTo }) {
  if (!emailConfigured(env)) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 150),
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("Resend request failed", err);
    return false;
  }
}
