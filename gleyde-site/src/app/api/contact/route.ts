import { NextResponse } from "next/server";

/**
 * POST /api/contact
 *
 * Stub endpoint for the contact form. It validates the input and returns
 * { ok: true }. To actually deliver messages, replace the TODO below with an
 * email provider (Resend, Postmark, SendGrid…) or a database insert, using
 * secrets from Vercel environment variables.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name, email, message, company } = (body ?? {}) as Record<string, unknown>;

  // Honeypot filled in: pretend success so bots learn nothing.
  if (typeof company === "string" && company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  if (typeof name !== "string" || !name.trim() || name.length > 100) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 422 });
  }
  if (typeof email !== "string" || !EMAIL.test(email) || email.length > 200) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });
  }
  if (typeof message !== "string" || !message.trim() || message.length > 5000) {
    return NextResponse.json({ error: "Please enter a message." }, { status: 422 });
  }

  // TODO: deliver the message. Example with Resend:
  //   await resend.emails.send({ from, to: site.email, replyTo: email, subject: `New message from ${name}`, text: message });

  return NextResponse.json({ ok: true });
}
