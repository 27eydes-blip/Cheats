import { Frame } from "@/components/ui/Frame";
import { PageHeader } from "@/components/PageHeader";
import { requireViewerPage } from "@/lib/session";
import { ALERT_KINDS, getAlertPrefs, pushConfigured, subscriptionCount } from "@/lib/push/push";
import { AlertsSettings } from "./AlertsSettings";

export const metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await requireViewerPage("/settings/alerts");
  return (
    <Frame>
      <PageHeader title="Alerts" back compact />
      <p className="px-4 pt-4 text-[14px] text-ink-2 sm:px-6">Push alerts on your phone or computer. We only ask your browser for permission when you turn them on here.</p>
      <AlertsSettings prefs={getAlertPrefs(u.id)} kinds={ALERT_KINDS} configured={pushConfigured()} devices={subscriptionCount(u.id)} />
    </Frame>
  );
}
