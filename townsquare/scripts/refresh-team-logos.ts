/**
 * Refresh team data and logos.
 *
 *   npm run teams:refresh            # seed/update teams, fetch logos never fetched before
 *   npm run teams:refresh -- --force # re-fetch every provider logo (manual uploads are kept)
 *
 * Logos come from TheSportsDB by default (SPORTS_DATA_KEY, or the free key).
 * SPORTS_LOGO_PROVIDER=none switches it off; teams then use generated badges.
 */
import { fetchProviderLogo, logoProvider } from "../src/lib/sports/logo-provider";
import { listTeams, seedTeams } from "../src/lib/sports/teams";

async function main() {
  seedTeams();
  const teams = listTeams();
  const provider = logoProvider();
  console.log(`${teams.length} teams seeded.`);
  if (!provider) {
    console.log("Logo provider switched off (SPORTS_LOGO_PROVIDER=none). Generated badges will be used.");
    return;
  }
  const force = process.argv.includes("--force");
  const tally: Record<string, number> = {};
  for (const t of teams) {
    const r = await fetchProviderLogo(t, { force, provider });
    tally[r] = (tally[r] ?? 0) + 1;
  }
  console.log(`Provider "${provider.name}":`, tally);
}
main();
