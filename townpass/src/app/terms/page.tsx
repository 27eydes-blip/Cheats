import { LegalPage } from "@/components/Legal";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms of Sale & Use" };

// TEMPLATE: have a lawyer review before launch. Replace [BUSINESS LEGAL NAME] and [STATE].
export default async function Terms() {
  const { BRAND_NAME: brand, SUPPORT_EMAIL: support } = await getEnv();
  return (
    <LegalPage title="Terms of Sale & Use" brand={brand} support={support}>
      <p className="text-sm text-muted">Last updated: November 12, 2026</p>
      <p>
        {brand} is operated by [BUSINESS LEGAL NAME] (“we”). By buying or using a {brand} guide you agree to these terms.
      </p>
      <h2>What you get</h2>
      <p>
        A purchase unlocks the digital guide for one city for the period shown at checkout (for example “lifetime access”, meaning
        for as long as we operate that city’s guide). Access is personal; your access link and cookie should not be shared or resold.
      </p>
      <h2>Payment</h2>
      <p>
        Payments are processed by Stripe. We never see or store your full card number. Prices are in US dollars and include any
        applicable fees.
      </p>
      <h2>All sales final</h2>
      <p>
        Because the guide is digital content delivered immediately, <strong>all sales are final and non-refundable</strong>, except
        where a refund is required by law. If you were charged twice or can’t access a guide you paid for, email{" "}
        <a className="text-gold underline" href={`mailto:${support}`}>{support}</a> and we’ll make it right. If a payment is refunded
        or disputed, access to the guide is removed.
      </p>
      <h2>Accuracy of information</h2>
      <p>
        Hours, prices, rules and other details change, often without notice, and seasonal businesses may open or close unexpectedly.
        Each listing shows when it was last verified. Information is provided “as is” for general guidance; always confirm critical
        details (e.g. parking rules, permits, tide and beach conditions) with official signs and sources. We are not affiliated with
        the businesses listed and are not responsible for their services, or for tickets, tows or fines.
      </p>
      <h2>Acceptable use</h2>
      <p>You may not copy, scrape, republish or redistribute the guide’s content.</p>
      <h2>Liability</h2>
      <p>
        To the maximum extent permitted by law, our total liability for any claim relating to {brand} is limited to the amount you paid
        for the guide in question.
      </p>
      <h2>Changes & law</h2>
      <p>
        We may update these terms; the version shown at the time of purchase applies to that purchase. These terms are governed by
        the laws of [STATE], USA.
      </p>
    </LegalPage>
  );
}
