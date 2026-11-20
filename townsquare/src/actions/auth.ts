"use server";
import { redirect } from "next/navigation";
import { authenticate, createUser } from "@/lib/users";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp, endSession, startSession } from "@/lib/session";
import { attempt, type Result } from "./result";

/** Only allow same-site relative redirects after login. */
function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function signupAction(_: Result | null, form: FormData): Promise<Result> {
  const res = await attempt(async () => {
    // Honeypot field: real people never fill it in.
    if (form.get("website")) throw new Error("bot");
    rateLimit("signupPerIp", await clientIp());
    const user = await createUser({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      handle: String(form.get("handle") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
      ageConfirmed: form.get("age") === "on",
      acceptTerms: form.get("terms") === "on",
    } as never);
    await startSession(user.id);
  });
  if (res.ok) redirect("/?welcome=1");
  return res;
}

export async function loginAction(_: Result | null, form: FormData): Promise<Result> {
  const res = await attempt(async () => {
    rateLimit("loginPerIp", await clientIp());
    const user = await authenticate(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    await startSession(user.id);
  });
  if (res.ok) redirect(safeNext(form.get("next")));
  return res;
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
