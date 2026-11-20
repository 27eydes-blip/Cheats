import { requireViewerPage } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { AccountForm, DeleteForm, PasswordForm } from "../forms";

export const metadata = { title: "Account" };

export default async function Page() {
  const u = await requireViewerPage("/settings/account");
  return (
    <>
      <PageHeader title="Account" back compact />
      <AccountForm handle={u.handle} email={u.email} hideFollows={!!u.hide_follows} />
      <div className="border-t border-line"><PasswordForm hasPassword={!!u.password_hash} /></div>
      <div className="border-t border-line px-4 py-5 sm:px-6">
        <h2 className="font-display text-h3 font-semibold">Appeals</h2>
        <p className="text-sm text-ink-3">
          If a post of yours was removed or your account was limited and you think it was a mistake, email appeals@ (address set at launch) with the post link. We aim to respond within 7 days.
        </p>
      </div>
      <div className="border-t border-line"><DeleteForm hasPassword={!!u.password_hash} /></div>
    </>
  );
}
