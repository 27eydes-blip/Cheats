/**
 * POST /api/contact on Cloudflare Pages (the static-export build).
 * Same behaviour as src/app/api/contact/route.ts, which Pages cannot run.
 */
import { validateContact } from "../../src/lib/contact";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request }: { request: Request }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const result = validateContact(body);
  if (!result.ok) return json({ error: result.error }, result.status);

  // TODO: deliver the message (e.g. Resend's HTTP API with a key stored as a
  // Pages secret). Until then the form validates and thanks the visitor.
  return json({ ok: true });
}
