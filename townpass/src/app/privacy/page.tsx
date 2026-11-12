import { LegalPage } from "@/components/Legal";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy Policy" };

// TEMPLATE: have a lawyer review before launch.
export default async function Privacy() {
  const { BRAND_NAME: brand, SUPPORT_EMAIL: support } = await getEnv();
  return (
    <LegalPage title="Privacy Policy" brand={brand} support={support}>
      <p className="text-sm text-muted">Last updated: November 12, 2026</p>
      <p>We collect as little as possible. There are no accounts and no advertising trackers.</p>
      <h2>What we collect</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Purchase info:</strong> your email address (from checkout), the amount, date, city and which QR sticker you scanned.
          Card and wallet details are handled by Stripe, not us (see stripe.com/privacy).
        </li>
        <li>
          <strong>Access cookie:</strong> a signed cookie that remembers your purchase on this device. It’s required for the service.
        </li>
        <li>
          <strong>Scan counts:</strong> when you scan a sticker we record the sticker ID and time, not who you are.
        </li>
        <li>
          <strong>Reports:</strong> if you report wrong info, we store your message and a one-way hash of your IP address for spam
          prevention.
        </li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To deliver and restore your access, send your access link (via our email provider, Resend), prevent fraud, and understand
        which stickers and cities perform. We don’t sell or share your personal information for advertising.
      </p>
      <h2>Retention & your choices</h2>
      <p>
        Purchase records are kept as long as needed for access and for tax/accounting. To request access to or deletion of your
        data, email <a className="text-gold underline" href={`mailto:${support}`}>{support}</a>. Deleting your data ends your ability to
        restore access.
      </p>
      <h2>Sponsor</h2>
      <p>
        CoastPassGo is sponsored by Glydrift. Sponsor links count a tap on our side (which page and town, nothing about
        you) and then open glydrift.com, which has its own privacy policy. We don’t share your email or purchase with sponsors.
      </p>
      <h2>Service providers</h2>
      <p>Cloudflare (hosting), Stripe (payments), Resend (email), Open-Meteo (weather data; we send only each town’s coordinates, never anything about you).</p>
    </LegalPage>
  );
}
