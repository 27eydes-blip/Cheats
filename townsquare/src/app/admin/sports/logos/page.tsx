import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewerPage } from "@/lib/session";
import { logoAdminRows } from "@/lib/sports/logo-admin";
import { listAliases } from "@/lib/sports/aliases";
import { logoProvider } from "@/lib/sports/logo-provider";
import { LEAGUES, LEAGUE_NAME } from "@/lib/sports/teams-data";
import { Frame, PageTitle } from "@/components/ui/Frame";
import { Kicker } from "@/components/ui/Badge";
import { TeamLogosAdmin } from "./TeamLogosAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team logos" };

export default async function TeamLogosPage() {
  const admin = await requireViewerPage("/admin/sports/logos");
  if (admin.role !== "admin") notFound();
  const rows = logoAdminRows();
  return (
    <Frame width="wide">
      <PageTitle
        folio={
          <Kicker tone="gold">
            <Link href="/admin" className="tap inline-flex min-h-6 items-center hover:underline">Control Room</Link> /{" "}
            <Link href="/admin/sports" className="tap inline-flex min-h-6 items-center hover:underline">Sports data</Link>
          </Kicker>
        }
        title="Team logos"
        dek="Each team shows its uploaded logo first, then the TheSportsDB badge, then a letter badge in the team's color. Pick a different one for any team below."
      />
      <TeamLogosAdmin rows={rows} aliases={listAliases()} leagues={LEAGUES.map((l) => ({ id: l, name: LEAGUE_NAME[l] }))} provider={logoProvider()?.label ?? "Off (SPORTS_LOGO_PROVIDER=none)"} />
    </Frame>
  );
}
