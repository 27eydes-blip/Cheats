import { APP_NAME, COMPANY } from "@/config";
import { PageHeader } from "@/components/PageHeader";
import { Kicker } from "@/components/ui/Badge";

/** Shared wrapper for legal pages. Every page carries the lawyer-review warning. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} kicker={<Kicker tone="muted">Legal</Kicker>} back />
      <div className="px-4 pb-10 sm:px-6">
        <div role="note" className="mb-6 rounded-[var(--r-lg)] bg-warning-bg p-4 text-[14px] ring-1 ring-warning/40">
          <b>Draft placeholder text.</b> This page has not been reviewed by a lawyer and is not legally binding. {COMPANY} must have qualified counsel review and replace it
          before {APP_NAME} launches to the public.
        </div>
        <p className="mb-4 text-[13px] text-ink-3">Last updated: {updated}</p>
        <div className="max-w-prose space-y-4 text-[16px] leading-relaxed text-ink-2 [&_b]:text-ink-1 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-h3 [&_h2]:font-semibold [&_h2]:text-ink-1 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1">
          {children}
        </div>
      </div>
    </>
  );
}
