// Checks every episodes/epXX/scenes.json against script/season1.md (word for word) and lists scene usage.
import { checkEpisode, loadEpisodes, loadScript } from './lib/episodes';

const script = loadScript();
const eps = loadEpisodes();
let bad = 0;
for (const ep of eps) {
  const p = checkEpisode(ep, script);
  if (p.length) { bad++; p.forEach((x) => console.error('✗ ' + x)); }
  else console.log(`✓ EP${ep.n} "${ep.title}": ${ep.beats.length} shots, narration matches the script`);
}
const missing = [...script.keys()].filter((n) => !eps.some((e) => e.n === n));
if (missing.length) console.log(`  (no scenes.json yet for episode${missing.length > 1 ? 's' : ''} ${missing.join(', ')})`);
if (bad) process.exit(1);
