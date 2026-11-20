import { requireViewerPage } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { AccountForm, DeleteForm, PasswordForm } from "../forms";

export const metadata = { title: "Account" };

export default async function Page() {
  const u = await requireViewerPage("/settings/account");
  return (
    <>
      <PageHeader title="Account" back />
      <AccountForm handle={u.handle} email={u.email} hideFollows={!!u.hide_follows} />
      <div className="border-t border-line"><PasswordForm hasPassword={!!u.password_hash} /></div>
      <div className="border-t border-line p-4">
        <h2 className="text-lg font-extrabold">Appeals</h2>
        <p className="text-sm text-muted">
          If a post of yours was removed or your account was limited and you think it was a mistake, email appeals@ (address set at launch) with the post link. We aim to respond within 7 days.
        </p>
      </div>
      <div className="border-t border-line"><DeleteForm hasPassword={!!u.password_hash} /></div>
    </>
  );
}
