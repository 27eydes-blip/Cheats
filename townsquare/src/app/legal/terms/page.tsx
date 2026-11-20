import { APP_NAME, COMPANY } from "@/config";
import { LegalPage } from "../LegalPage";

export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="November 2026 (draft)">
      <p>These terms are an agreement between you and {COMPANY} (&ldquo;we&rdquo;), which runs {APP_NAME}. By using {APP_NAME}, you agree to them.</p>
      <h2>Who can use {APP_NAME}</h2>
      <ul><li>You must be at least 13 years old.</li><li>You must give accurate sign-up information and keep your password safe.</li><li>One person may not run accounts to get around a suspension.</li></ul>
      <h2>Your content</h2>
      <p>You own what you post. You give us a license to host, show, and share it inside {APP_NAME} so the service can work. You are responsible for what you post and must have the right to post it.</p>
      <h2>Rules</h2>
      <p>You must follow the Community Guidelines. They apply the same way to every account, including public figures and staff.</p>
      <h2>Moderation</h2>
      <p>We may remove content or limit accounts that break the rules. We tell you when we act and you can appeal.</p>
      <h2>Copyright</h2>
      <p>If you believe content infringes your copyright, send a notice to our designated agent (DMCA agent to be registered before launch). Repeat infringers lose their accounts.</p>
      <h2>News content</h2>
      <p>News items show headlines and short snippets with a link to the original outlet. Rights stay with the outlet.</p>
      <h2>Ending your account</h2>
      <p>You can delete your account at any time from Settings. We may end accounts that seriously or repeatedly break these terms.</p>
      <h2>Disclaimers and limits</h2>
      <p>{APP_NAME} is provided &ldquo;as is.&rdquo; To the extent the law allows, our liability is limited. (Counsel to draft.)</p>
      <h2>Changes</h2>
      <p>We will tell you about important changes before they take effect.</p>
    </LegalPage>
  );
}
