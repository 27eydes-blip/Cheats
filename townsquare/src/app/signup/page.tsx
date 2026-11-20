import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { AuthCard, SignupForm } from "../login/AuthForms";
import { SamplePage } from "../login/SamplePage";

export const metadata = { title: "Create account" };

export default async function Signup() {
  if (await getViewer()) redirect("/");
  return (
    <AuthCard preview={<SamplePage />} title="Say it. Read it. Debate it." subtitle="Free, for every viewpoint, under the same rules. Takes a minute." google={!!process.env.GOOGLE_CLIENT_ID}>
      <SignupForm />
    </AuthCard>
  );
}
