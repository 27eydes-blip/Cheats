import { APP_NAME } from "@/config";
import { LegalPage } from "../LegalPage";

export const metadata = { title: "Community Guidelines" };

export default function Guidelines() {
  return (
    <LegalPage title="Community Guidelines" updated="November 2026 (draft)">
      <p>
        {APP_NAME} is for every viewpoint. We lean hard toward free expression on opinions and politics, and draw a hard line on illegal and dangerous content. The same rules apply to
        every account, public figures included.
      </p>
      <h2>Not allowed</h2>
      <ul>
        <li><b>Threats and violence:</b> threatening, or calling for, violence against anyone.</li>
        <li><b>Harassment:</b> targeted, repeated abuse or pile-ons against a person.</li>
        <li><b>Doxxing:</b> posting someone&apos;s private info (home address, phone, private documents) without consent.</li>
        <li><b>Child sexual exploitation:</b> zero tolerance. We remove it, ban the account, and report it to NCMEC.</li>
        <li><b>Sexual content</b> involving anyone without consent.</li>
        <li><b>Illegal sales:</b> drugs, weapons where illegal, stolen data, and similar.</li>
        <li><b>Spam and scams:</b> fake giveaways, crypto-doubling, mass unwanted posts, fake engagement.</li>
        <li><b>Impersonation</b> meant to deceive. Parody is fine if it&apos;s clearly labeled.</li>
      </ul>
      <h2>Allowed</h2>
      <p>Strong opinions, criticism of public figures and institutions, political argument from any side, satire, and disagreement — even heated.</p>
      <h2>What happens when rules are broken</h2>
      <ul><li>Warning</li><li>Content removal</li><li>Temporary suspension</li><li>Permanent ban for severe or repeated violations</li></ul>
      <p>Every action is logged, you are told what happened, and you can appeal. We will publish a quarterly transparency report.</p>
      <h2>Reporting</h2>
      <p>Use the report option on any post or profile. Reports are confidential.</p>
    </LegalPage>
  );
}
