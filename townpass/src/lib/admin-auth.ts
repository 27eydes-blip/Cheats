import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "./env";
import { signToken, verifyToken } from "./token";

export const ADMIN_COOKIE = "tp_admin";
const SESSION_HOURS = 12;

export async function createAdminSession(env: CloudflareEnv) {
  const token = await signToken({ k: "admin", exp: Date.now() + SESSION_HOURS * 3_600_000 }, adminSecret(env));
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

/** Changing ADMIN_PASSWORD invalidates all existing admin sessions. */
function adminSecret(env: CloudflareEnv) {
  return `${env.ACCESS_TOKEN_SECRET}:admin:${env.ADMIN_PASSWORD}`;
}

export async function isAdmin(): Promise<boolean> {
  const env = await getEnv();
  if (!env.ADMIN_PASSWORD) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!(await verifyToken(token, adminSecret(env), "admin"));
}

/** Call at the top of every admin page, server action and admin route handler. */
export async function requireAdmin(): Promise<CloudflareEnv> {
  if (!(await isAdmin())) redirect("/admin/login");
  return getEnv();
}
