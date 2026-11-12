// One-time setup for the local narrator (Kokoro TTS): a Python venv + the voice model (~340 MB).
// Safe to run again; it skips anything already in place. Needs Python 3.10+ on your PATH.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = path.join(__dirname, '..');
export const VOICE_DIR = process.env.VOICE_DIR || path.join(ROOT, '.voice');
const isWin = process.platform === 'win32';
export const VOICE_PY = path.join(VOICE_DIR, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
const FILES = {
  'kokoro-v1.0.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
  'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
};

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
};

async function main() {
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  if (!fs.existsSync(VOICE_PY)) {
    const py = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);
    if (!py) throw new Error('Python 3.10+ is needed for the narrator voice. Install it from python.org and run `npm run voice:setup` again.');
    console.log('Creating the voice environment…');
    run(py, ['-m', 'venv', path.join(VOICE_DIR, 'venv')]);
  }
  if (spawnSync(VOICE_PY, ['-c', 'import kokoro_onnx, soundfile']).status !== 0) {
    console.log('Installing Kokoro TTS…');
    run(VOICE_PY, ['-m', 'pip', 'install', '--quiet', 'kokoro-onnx==0.6.1', 'soundfile']);
  }
  for (const [name, url] of Object.entries(FILES)) {
    const dest = path.join(VOICE_DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) continue;
    console.log(`Downloading ${name}…`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest + '.part'));
    fs.renameSync(dest + '.part', dest);
  }
  console.log('Narrator voice ready.');
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
