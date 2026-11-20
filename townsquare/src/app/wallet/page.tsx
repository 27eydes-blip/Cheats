import { notFound } from "next/navigation";
import { FEATURES } from "@/config";
import { requireViewerPage } from "@/lib/session";
import { WalletIcon } from "@/components/icons";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";

export const metadata = { title: "Wallet" };

/** Wallet placeholder. Hidden (404) unless the wallet feature flag is on. No money features exist yet. */
export default async function Wallet() {
  if (!FEATURES.wallet) notFound();
  await requireViewerPage("/wallet");
  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Preview</Kicker>} title="Wallet" dek="Tips and subscriptions are not available yet." />
      <div className="px-3 pt-4 sm:px-4">
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[rgb(47_107_255/0.16)] text-[var(--wn-blue-ink)]"><WalletIcon size={28} /></span>
          <p className="font-display text-[24px] font-extrabold uppercase">Coming soon</p>
          <p className="max-w-[44ch] text-[14.5px] text-ink-2">This is a placeholder. No balances, payments or card details are collected or stored.</p>
        </div>
      </div>
    </Frame>
  );
}
