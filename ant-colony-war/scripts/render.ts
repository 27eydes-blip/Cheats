// Renders every episode (or the ones given) to out/*.mp4.
//   npm run render            -> all episodes
//   npm run render -- 3 4     -> episodes 3 and 4
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { EPISODES } from '../script/episodes';
import { getTimeline } from '../src/timeline/load';
import { MAX_SECONDS, MIN_SECONDS } from '../src/config';

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

(async () => {
  const want = process.argv.slice(2).map(Number).filter(Boolean);
  const eps = EPISODES.filter((e) => !want.length || want.includes(e.n));
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Bundling…');
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts'), publicDir: path.join(ROOT, 'public') });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  for (const ep of eps) {
    const tl = getTimeline(ep);
    if (tl.mock) console.warn(`EP${ep.n}: no narration generated yet, rendering a silent preview (run \`npm run audio\`).`);
    if (tl.duration < MIN_SECONDS || tl.duration > MAX_SECONDS) console.warn(`EP${ep.n}: ${tl.duration.toFixed(1)}s is outside ${MIN_SECONDS}-${MAX_SECONDS}s. Adjust the script or pauses.`);
    const id = `EP${String(ep.n).padStart(2, '0')}`;
    const composition = await selectComposition({ serveUrl, id, inputProps: { ep }, browserExecutable });
    const file = path.join(OUT, `ant-colony-war-ep${String(ep.n).padStart(2, '0')}-${slug(ep.title)}.mp4`);
    const t0 = Date.now();
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      crf: 18,
      pixelFormat: 'yuv420p',
      audioBitrate: '192k',
      outputLocation: file,
      inputProps: { ep },
      browserExecutable,
      imageFormat: 'jpeg',
      jpegQuality: 92,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 20) * 5;
        if (pct !== last) { last = pct; process.stdout.write(`\r${id} ${pct}%   `); }
      },
    });
    console.log(`\r${id} done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${path.relative(ROOT, file)} (${tl.duration.toFixed(1)}s)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
