import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { AuthCard, SignupForm } from "../login/AuthForms";

export const metadata = { title: "Create account" };

export default async function Signup() {
  if (await getViewer()) redirect("/");
  return (
    <AuthCard title="Join the conversation" google={!!process.env.GOOGLE_CLIENT_ID}>
      <SignupForm />
    </AuthCard>
  );
}
