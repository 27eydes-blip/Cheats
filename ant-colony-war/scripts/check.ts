// Checks every episodes/epXX/scenes.json against script/season1.md (word for word) and lists scene usage.
import { checkEpisode, loadEpisodes, loadScript } from './lib/episodes';

const eps = loadEpisodes();
let bad = 0;
for (const ep of eps) {
  const p = checkEpisode(ep);
  if (p.length) { bad++; p.forEach((x) => console.error('✗ ' + x)); }
  else console.log(`✓ ${ep.season > 1 ? `S${ep.season} ` : ''}EP${ep.n} "${ep.title}": ${ep.beats.length} shots, narration matches the script`);
}
for (const season of [1, 2]) {
  const missing = [...loadScript(season).keys()].filter((n) => !eps.some((e) => e.season === season && e.n === n));
  if (missing.length) console.log(`  (season ${season}: no scenes.json yet for episode${missing.length > 1 ? 's' : ''} ${missing.join(', ')})`);
}
if (bad) process.exit(1);
