import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { SportsDataStatus } from "./SportsDataStatus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sports data" };

export default async function SportsDataPage() {
  const admin = await requireViewerPage("/admin/sports");
  if (admin.role !== "admin") notFound();
  return (
    <Frame width="medium">
      <PageTitle folio={<Kicker tone="gold"><Link href="/admin" className="tap inline-flex min-h-6 items-center hover:underline">Control Room</Link></Kicker>} title="Sports data" dek="Schedules, scores, standings and team logos." />
      <div className="space-y-8 px-4 pt-5 pb-12 sm:px-6">
        <section aria-labelledby="sync">
          <h2 id="sync" className="text-[18px] font-bold">Schedules and scores</h2>
          <SportsDataStatus />
        </section>
        <section aria-labelledby="logos">
          <h2 id="logos" className="text-[18px] font-bold">Team logos</h2>
          <p className="mt-1 text-[14px] text-ink-2">Upload logos, choose between an uploaded logo, the TheSportsDB badge and the letter badge for each team, and fix team names the data feed writes differently.</p>
          <Link href="/admin/sports/logos" className="btn-outline mt-3 !min-h-10 !text-[14px]">Open Team logos</Link>
        </section>
      </div>
    </Frame>
  );
}
