/** Transactional email via Resend's HTTP API (no SDK needed on Workers). */

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(env: CloudflareEnv, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email disabled: RESEND_API_KEY unset] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [mail.to],
      reply_to: env.SUPPORT_EMAIL,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return false;
  }
  return true;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function accessEmail(opts: { brand: string; cityName: string; link: string; restore?: boolean; access: string }) {
  const { brand, cityName, link, restore, access } = opts;
  const subject = restore ? `Your ${brand} link for ${cityName}` : `You're in: ${cityName} guide (${brand})`;
  const intro = restore
    ? `Here's your link to get back into the ${cityName} guide.`
    : `Thanks for your purchase! Your ${cityName} guide is unlocked (${access}).`;
  const text = `${intro}\n\nOpen your guide: ${link}\n\nSave this email - tap the link on any phone to restore access.\n\n- ${brand}`;
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0d;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#eee">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
  <div style="color:#d4af37;font-size:13px;letter-spacing:.2em;text-transform:uppercase">${esc(brand)}</div>
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:28px;margin:12px 0 16px">${esc(cityName)}</h1>
  <p style="line-height:1.5;color:#ccc">${esc(intro)}</p>
  <p style="margin:28px 0"><a href="${esc(link)}" style="background:#d4af37;color:#0b0b0d;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block">Open my guide</a></p>
  <p style="font-size:13px;color:#888;line-height:1.5">Save this email. Tap the button on any phone to restore access. Don't forward it: anyone with this link can open your guide.</p>
</div></body></html>`;
  return { subject, html, text };
}
