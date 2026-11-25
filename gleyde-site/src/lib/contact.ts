/**
 * Contact form validation, shared by the Next.js route (src/app/api/contact)
 * and the Cloudflare Pages Function (functions/api/contact.ts), so both
 * hosts accept and reject exactly the same input.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactResult =
  | { ok: true; spam: boolean; name: string; email: string; message: string }
  | { ok: false; status: number; error: string };

export function validateContact(body: unknown): ContactResult {
  const { name, email, message, company } = (body ?? {}) as Record<string, unknown>;

  // Honeypot filled in: report success so bots learn nothing, but flag it.
  if (typeof company === "string" && company.trim() !== "") {
    return { ok: true, spam: true, name: "", email: "", message: "" };
  }
  if (typeof name !== "string" || !name.trim() || name.length > 100) {
    return { ok: false, status: 422, error: "Please enter your name." };
  }
  if (typeof email !== "string" || !EMAIL.test(email) || email.length > 200) {
    return { ok: false, status: 422, error: "Please enter a valid email address." };
  }
  if (typeof message !== "string" || !message.trim() || message.length > 5000) {
    return { ok: false, status: 422, error: "Please enter a message." };
  }
  return { ok: true, spam: false, name: name.trim(), email: email.trim(), message: message.trim() };
}
