// Renders every episode (or the ones given) to out/*.mp4.
//   npm run render            -> all episodes
//   npm run render -- 3 4     -> episodes 3 and 4
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { checkEpisode, loadEpisodes } from './lib/episodes';
import { hasFfmpeg, makeTv } from './tv';

const EPISODES = loadEpisodes();
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
    const problems = checkEpisode(ep);
    if (problems.length) throw new Error(problems.join('\n'));
    const tl = getTimeline(ep);
    if (tl.mock) console.warn(`EP${ep.n}: no narration generated yet, rendering a silent preview (run \`npm run audio\`).`);
    if (tl.duration < MIN_SECONDS || tl.duration > MAX_SECONDS) console.warn(`EP${ep.n}: ${tl.duration.toFixed(1)}s is outside ${MIN_SECONDS}-${MAX_SECONDS}s. Adjust the script or pauses.`);
    const id = `EP${String(ep.n).padStart(2, '0')}`;
    const composition = await selectComposition({ serveUrl, id, inputProps: { ep }, browserExecutable, timeoutInMilliseconds: 180000 });
    const file = path.join(OUT, `ant-colony-war-ep${String(ep.n).padStart(2, '0')}-${slug(ep.title)}.mp4`);
    const t0 = Date.now();
    let last = -1;
    // Chrome occasionally stalls on a frame under heavy load: retry with fewer parallel tabs.
    for (let attempt = 1; ; attempt++) {
      const concurrency = Math.max(1, (Number(process.env.RENDER_CONCURRENCY) || os.cpus().length) - (attempt - 1));
      try {
        await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        crf: 25,
      x264Preset: 'slow',
        pixelFormat: 'yuv420p',
        audioBitrate: '192k',
        outputLocation: file,
        inputProps: { ep },
        browserExecutable,
        imageFormat: 'jpeg',
        jpegQuality: 92,
        concurrency,
        // heavy swarm shots can take a while per frame on slow machines
        timeoutInMilliseconds: 180000,
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 20) * 5;
          if (pct !== last) { last = pct; process.stdout.write(`\r${id} ${pct}%   `); }
        },
      });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        console.warn(`\n${id}: render stalled (${e instanceof Error ? e.message.split('\n')[0] : e}); retrying with concurrency ${concurrency - 1}…`);
      }
    }
    // 16:9 TV / screen-share version alongside the vertical one
    if (process.env.TV !== '0' && hasFfmpeg()) console.log(`\r${id} TV version -> ${path.relative(ROOT, makeTv(file))}`);
    console.log(`\r${id} done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${path.relative(ROOT, file)} (${tl.duration.toFixed(1)}s)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
