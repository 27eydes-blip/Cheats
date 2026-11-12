// Renders a contact sheet: one still from the middle of every shot of an episode.
//   npm run still -- 4            -> out/stills/ep04-*.jpg
//   npm run still -- 4 12.5       -> a single frame at 12.5 s
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { loadEpisodes } from './lib/episodes';

const EPISODES = loadEpisodes();
import { getTimeline } from '../src/timeline/load';
import { FPS } from '../src/config';

const ROOT = path.join(__dirname, '..');
(async () => {
  const [n, at] = process.argv.slice(2).map(Number);
  const ep = EPISODES.find((e) => e.n === (n || 1))!;
  const tl = getTimeline(ep);
  const dir = path.join(ROOT, 'out', 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const prefix = `ep${String(ep.n).padStart(2, '0')}-`;
  if (!(at >= 0)) for (const f of fs.readdirSync(dir)) if (f.startsWith(prefix)) fs.unlinkSync(path.join(dir, f));
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts'), publicDir: path.join(ROOT, 'public') });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const id = `EP${String(ep.n).padStart(2, '0')}`;
  const composition = await selectComposition({ serveUrl, id, inputProps: { ep }, browserExecutable });
  const times = at >= 0 && !Number.isNaN(at) ? [at] : tl.beats.map((b, i) => (i === 0 ? tl.narrationStart + 0.5 : (b.start + b.end) / 2)).concat([1.0, tl.endStart + 2]);
  for (const t of times) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(t * FPS));
    const out = path.join(dir, `ep${String(ep.n).padStart(2, '0')}-${String(frame).padStart(5, '0')}.jpg`);
    await renderStill({ composition, serveUrl, frame, output: out, inputProps: { ep }, browserExecutable, imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5 });
    console.log(out);
  }
})().catch((e) => { console.error(e); process.exit(1); });
