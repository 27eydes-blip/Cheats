import { rundown } from "@/lib/rundown";
import { requireViewerPage } from "@/lib/session";
import { RundownList } from "@/components/rundown/RundownList";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Rundown" };

export default async function RundownPage() {
  const viewer = await requireViewerPage("/rundown");
  const data = rundown(viewer.id);
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Your lineup</Kicker>} title="The Rundown" dek={`Your ${day}, set like a broadcast lineup: what's on now, what's next, and what you saved for later.`} />
      <div className="px-4 pt-6 sm:px-6"><RundownList data={data} /></div>
    </Frame>
  );
}
