import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomToken } from "@/lib/passwords";

export const dynamic = "force-dynamic";

/** Begin Google sign-in (OAuth 2.0 authorization code flow with a state cookie). */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!clientId) return NextResponse.redirect(new URL("/login?error=google_not_configured", appUrl));
  const state = randomToken(24);
  (await cookies()).set("g_state", state, { httpOnly: true, sameSite: "lax", path: "/auth/google", maxAge: 600, secure: appUrl.startsWith("https://") });
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return NextResponse.redirect(u);
}
