import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AppError } from "./errors";
import { createSession, destroySession, userFromSession, type UserRow } from "./users";

export const SESSION_COOKIE = "ts_session";

/** The signed-in user for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<UserRow | null> => {
  const jar = await cookies();
  return userFromSession(jar.get(SESSION_COOKIE)?.value);
});

/** For server actions: throws a friendly error when signed out. */
export async function requireViewer(): Promise<UserRow> {
  const u = await getViewer();
  if (!u) throw new AppError("Please log in first.", "auth");
  return u;
}

/** For pages: redirects to /login when signed out. */
export async function requireViewerPage(next = "/"): Promise<UserRow> {
  const u = await getViewer();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  jar.delete(SESSION_COOKIE);
}

/** Best-effort client IP for rate limiting (trust the first proxy hop only). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
