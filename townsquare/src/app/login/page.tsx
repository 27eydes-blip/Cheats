import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { AuthCard, LoginForm } from "./AuthForms";

export const metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet (add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).",
  google_state: "Google sign-in expired. Please try again.",
  google_token: "Google sign-in failed. Please try again.",
  google_profile: "Couldn't read your Google profile.",
  google_unverified: "Your Google email isn't verified.",
  account_deleted: "That account was deleted.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const sp = await searchParams;
  if (await getViewer()) redirect(sp.next?.startsWith("/") ? sp.next : "/");
  return (
    <AuthCard title="Log in" google={!!process.env.GOOGLE_CLIENT_ID} notice={sp.deleted ? "Your account was deleted. Sorry to see you go." : sp.error ? (ERRORS[sp.error] ?? "Sign-in failed.") : undefined}>
      <LoginForm next={sp.next ?? "/"} />
    </AuthCard>
  );
}
