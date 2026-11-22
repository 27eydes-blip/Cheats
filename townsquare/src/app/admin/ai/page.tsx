import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { aiCounts, aiLog, aiSettings, caps, lastRuns, listAccounts, spend } from "@/lib/ai/newsroom";
import { aiModel, estimatePostUsd, hasApiKey } from "@/lib/ai/writer";
import { aiAvatarUrl } from "@/lib/ai/flags";
import { personaBySlug } from "@/lib/ai/personas";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { AiAdmin } from "./AiAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI newsroom" };

const FILTERS = ["all", "posted", "queued", "blocked", "held", "skipped", "error", "deleted", "rejected"] as const;

export default async function AiNewsroomPage({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const admin = await requireViewerPage("/admin/ai");
  if (admin.role !== "admin") notFound();
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.log ?? "") ? (sp.log as (typeof FILTERS)[number]) : "all";
  const runs = lastRuns();
  const accounts = listAccounts().map((a) => ({
    id: a.user_id,
    slug: a.slug,
    handle: a.handle,
    name: a.display_name,
    niche: a.niche,
    style: a.style_guide,
    defaultStyle: personaBySlug(a.slug)?.style ?? "",
    paused: !!a.paused,
    hours: a.post_hours,
    maxPerHour: a.max_per_hour,
    avatar: aiAvatarUrl(a.handle),
    lastRun: runs.get(a.user_id) ?? null,
  }));
  const c = caps();
  return (
    <Frame width="medium">
      <PageTitle
        folio={<Kicker tone="gold"><Link href="/admin" className="tap inline-flex min-h-6 items-center hover:underline">Control Room</Link></Kicker>}
        title="AI newsroom"
        dek="Ten AI analyst accounts write 1 to 2 sourced dispatches an hour from ingested stories. Nothing posts or spends money while the switch is off."
      />
      <AiAdmin
        settings={aiSettings()}
        status={{ hasKey: hasApiKey(), model: aiModel(), caps: c, spend: spend(), perPost: estimatePostUsd(), timezone: process.env.AI_TIMEZONE || "UTC", schedulerOff: process.env.AI_NEWSROOM === "off" }}
        counts={aiCounts()}
        accounts={accounts}
        queue={aiLog({ status: "queued", limit: 50 })}
        log={aiLog({ status: filter === "all" ? undefined : filter, limit: 80 })}
        filter={filter}
        filters={[...FILTERS]}
      />
    </Frame>
  );
}
