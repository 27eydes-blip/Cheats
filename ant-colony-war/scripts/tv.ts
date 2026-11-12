// Makes 16:9 TV / screen-share versions (1920x1080) of rendered episodes: the vertical video at full
// height in the centre, a blurred, darkened copy of the same shot filling the sides.
//   npm run tv            -> every out/*.mp4 into out/tv/
//   npm run tv -- 3       -> just episode 3
// Needs ffmpeg on your PATH (Remotion's built-in ffmpeg has no blur filter): https://ffmpeg.org/download.html
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const FILTER =
  '[0:v]split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=40:4,eq=brightness=-0.18:saturation=0.8[bg];' +
  '[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p[v]';

export function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-hide_banner', '-filters']).stdout?.toString().includes('boxblur') ?? false;
}

/** Converts one vertical episode to out/tv/<name>-tv.mp4 and returns its path. */
export function makeTv(file: string): string {
  const dir = path.join(path.dirname(file), 'tv');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(file, '.mp4') + '-tv.mp4');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-filter_complex', FILTER, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-maxrate', '4M', '-bufsize', '8M', '-c:a', 'copy', '-movflags', '+faststart', dest], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed for ' + file);
  return dest;
}

if (require.main === module) {
  if (!hasFfmpeg()) {
    console.error('TV versions need ffmpeg on your PATH (https://ffmpeg.org/download.html).');
    process.exit(1);
  }
  const want = process.argv.slice(2).map(Number).filter(Boolean);
  const files = fs.readdirSync(OUT).filter((f) => /^ant-colony-war-ep\d+.*\.mp4$/.test(f)).filter((f) => !want.length || want.includes(Number(f.match(/ep(\d+)/)![1])));
  for (const f of files) console.log('TV version ->', path.relative(ROOT, makeTv(path.join(OUT, f))));
}
