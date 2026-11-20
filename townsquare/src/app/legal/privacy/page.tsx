import { APP_NAME } from "@/config";
import { LegalPage } from "../LegalPage";

export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 2026 (draft)">
      <p>This explains what {APP_NAME} collects, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account info: email, handle, name, password (stored only as a secure hash), and Google ID if you sign in with Google.</li>
        <li>What you post and do: posts, images, likes, reposts, follows, Vault, poll votes, reports.</li>
        <li>Basic technical data: IP address for security and rate limiting, and a session cookie to keep you logged in.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <ul><li>We never sell your private data.</li><li>We strip location and camera data from every image you upload.</li><li>Your Vault is visible only to you.</li></ul>
      <h2>Your choices</h2>
      <ul><li>Download all your data from Settings → Privacy and safety.</li><li>Delete your account from Settings → Account.</li><li>Hide your follower lists, and block or mute anyone.</li></ul>
      <h2>Your rights</h2>
      <p>Depending on where you live (for example California under the CCPA, or the EU under the GDPR), you may have rights to access, correct, delete, or move your data and to object to some uses. (Counsel to complete for each law.)</p>
      <h2>Children</h2>
      <p>{APP_NAME} is not for children under 13, and we do not knowingly collect their data (COPPA).</p>
      <h2>Contact</h2>
      <p>Privacy contact address to be set before launch.</p>
    </LegalPage>
  );
}
