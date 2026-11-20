import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "@/lib/session";
import { upsertGoogleUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const fail = (why: string) => NextResponse.redirect(new URL(`/login?error=${why}`, appUrl));
  const jar = await cookies();
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const expected = jar.get("g_state")?.value;
  jar.delete("g_state");
  if (!code || !state || !expected || state !== expected) return fail("google_state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${appUrl}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("google_token");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) return fail("google_profile");
  const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!info.sub || !info.email || !info.email_verified) return fail("google_unverified");

  const user = upsertGoogleUser({ sub: info.sub, email: info.email, name: info.name ?? "" });
  if (user.status === "deleted") return fail("account_deleted");
  await startSession(user.id);
  return NextResponse.redirect(new URL("/", appUrl));
}
