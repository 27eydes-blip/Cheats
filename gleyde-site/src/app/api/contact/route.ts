import { NextResponse } from "next/server";
import { validateContact } from "@/lib/contact";

/**
 * POST /api/contact (Vercel / `next start`)
 *
 * Stub endpoint for the contact form. It validates the input and returns
 * { ok: true }. To actually deliver messages, replace the TODO below with an
 * email provider (Resend, Postmark, SendGrid…) or a database insert, using
 * secrets from your host's environment variables.
 *
 * The Cloudflare Pages build uses functions/api/contact.ts instead, with the
 * same validation.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = validateContact(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.spam) return NextResponse.json({ ok: true });

  // TODO: deliver the message. Example with Resend:
  //   await resend.emails.send({ from, to: site.email, replyTo: result.email,
  //     subject: `New message from ${result.name}`, text: result.message });

  return NextResponse.json({ ok: true });
}
