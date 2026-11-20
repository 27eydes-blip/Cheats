import { APP_NAME, COMPANY } from "@/config";
import { PageHeader } from "@/components/PageHeader";

/** Shared wrapper for legal pages. Every page carries the lawyer-review warning. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} back />
      <div className="px-4 py-5">
        <div role="note" className="mb-6 rounded-xl border-2 border-amber-500 bg-amber-500/10 p-4 text-sm">
          <b>DRAFT — PLACEHOLDER TEXT.</b> This page has not been reviewed by a lawyer and is not legally binding. {COMPANY} must have qualified counsel review and replace it before
          {" "}{APP_NAME} launches to the public.
        </div>
        <p className="mb-4 text-sm text-muted">Last updated: {updated}</p>
        <div className="space-y-4 text-[16px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-extrabold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      </div>
    </>
  );
}
