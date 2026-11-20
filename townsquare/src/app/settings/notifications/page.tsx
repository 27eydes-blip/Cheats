import { Frame } from "@/components/ui/Frame";
import { PageHeader } from "@/components/PageHeader";
import { requireViewerPage } from "@/lib/session";
import { getNotificationPrefs } from "@/lib/users";
import { NotificationPrefsForm } from "../forms";

export const metadata = { title: "Notification settings" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireViewerPage("/settings/notifications");
  return (
    <Frame>
      <PageHeader title="Notifications" back compact />
      <p className="px-4 pt-4 text-[14px] text-ink-2 sm:px-6">Choose what lands in your Newsdesk. Safety notices from moderators always arrive.</p>
      <NotificationPrefsForm prefs={getNotificationPrefs(u.id)} />
    </Frame>
  );
}
