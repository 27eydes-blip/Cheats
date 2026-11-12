// Generates the narration for every episode, with word-level timestamps.
//
// Narrator: a young British boy. By default this is a local voice (Kokoro TTS, free, no account):
// a blend of Kokoro's British voices pitched up into a boy's register. Run `npm run voice:setup` once.
// To use ElevenLabs instead, set TTS_ENGINE=elevenlabs, ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.
//
//   npm run audio                 all episodes
//   npm run audio -- 3 4          only episodes 3 and 4
//   npm run audio -- --force      ignore the cache and re-synthesise
//   npm run audio -- --mock       no API calls: print estimated episode lengths
//
// Each line (shot) is synthesised on its own (with ElevenLabs, the neighbouring lines are passed as
// context so the delivery stays continuous). That gives exact timing for every word and lets us put real, precise
// dramatic pauses between lines. Results are cached in audio/cache, so re-running only pays for lines
// you changed.
//
// Output: audio/epXX.mp3 (one file per episode), audio/epXX.json (word timings),
//         public/audio/epXX.mp3 (copy used by Remotion), src/data/timelines.ts (used by the compositions).
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkEpisode, loadEpisodes } from './lib/episodes';
import type { Episode } from '../script/types';
import { DEFAULT_PAUSE, buildTimeline, fitPauses, mockAlignment } from '../src/timeline/build';
import { parseBeat, spokenText } from '../src/timeline/parse';
import type { BeatAlignment, Timeline } from '../src/timeline/types';
import { MAX_SECONDS, MIN_SECONDS } from '../src/config';
import { VOICE_DIR, VOICE_PY } from './setup-voice';

const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'audio');
const CACHE = path.join(AUDIO, 'cache');
const PUBLIC_AUDIO = path.join(ROOT, 'public', 'audio');
const DATA = path.join(ROOT, 'src', 'data', 'timelines.ts');
const SR = 44100;
const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';

// Deep, calm, cinematic male narrator. "Brian" is a deep, resonant premade voice available on every
// account. For a grittier, war-veteran sound try Clyde (2EiwWnXFnvU5JabPnv8n), or run `npm run voices`
// and set ELEVENLABS_VOICE_ID in .env.
const ENGINE = (process.env.TTS_ENGINE || 'kokoro').toLowerCase();
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';

// The British boy (local engine). Blend of Kokoro voices + pitch shift; tweak to taste.
// Raise SEMITONES for a younger boy, lower it for a teenager.
const KOKORO = {
  voice: [['bm_fable', 0.55], ['bf_emma', 0.45]] as [string, number][],
  semitones: Number(process.env.VOICE_SEMITONES ?? 5),
  speed: Number(process.env.VOICE_SPEED ?? 0.92),
};
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const VOICE_SETTINGS = {
  stability: 0.42, // a little lower = more dramatic delivery
  similarity_boost: 0.82,
  style: 0.38,
  use_speaker_boost: true,
  speed: 0.86, // slow, deliberate pacing
};

const args = process.argv.slice(2);
const MOCK = args.includes('--mock');
const FORCE = args.includes('--force');
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const EPISODES = loadEpisodes();
const episodes = EPISODES.filter((e) => !only.length || only.includes(e.n));
const pad = (n: number) => String(n).padStart(2, '0');

/** Remotion ships its own ffmpeg, so nobody needs to install one. */
function ffmpeg(argv: string[], input?: Buffer): Buffer {
  const cli = path.join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  const r = spawnSync(process.execPath, [cli, 'ffmpeg', '-hide_banner', '-loglevel', 'error', ...argv], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr?.toString());
  return r.stdout;
}

type ElevenResponse = {
  audio_base64: string;
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
};

async function synthesise(text: string, previous: string | undefined, next: string | undefined): Promise<ElevenResponse> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('TTS_ENGINE=elevenlabs needs ELEVENLABS_API_KEY in .env.');
  const body = JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS, previous_text: previous, next_text: next });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    if (res.ok) return (await res.json()) as ElevenResponse;
    const msg = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const wait = 2000 * 2 ** (attempt - 1);
      console.warn(`  ElevenLabs ${res.status}, retrying in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 404 && /voice/i.test(msg)) throw new Error(`Voice ${VOICE_ID} not found on your account. Run \`npm run voices\` and set ELEVENLABS_VOICE_ID in .env.\n${msg}`);
    throw new Error(`ElevenLabs error ${res.status}: ${msg}`);
  }
}

/** Maps each token of the line to its start/end time using the character alignment. */
function alignTokens(spokenTokens: string[], al: NonNullable<ElevenResponse['alignment']>, duration: number) {
  const chars = al.characters;
  const joined = chars.join('').toLowerCase();
  const out: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const tk of spokenTokens) {
    const core = tk.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || tk.toLowerCase();
    let i = joined.indexOf(core, cursor);
    if (i < 0) i = cursor; // normalisation mismatch: fall back to the running position
    const j = Math.min(chars.length - 1, i + Math.max(1, core.length) - 1);
    const start = al.character_start_times_seconds[Math.min(i, chars.length - 1)] ?? 0;
    const end = al.character_end_times_seconds[j] ?? start + 0.3;
    out.push({ start, end: Math.max(end, start + 0.05) });
    cursor = j + 1;
  }
  // keep times monotonic and inside the clip
  for (let k = 1; k < out.length; k++) if (out[k].start < out[k - 1].start) out[k].start = out[k - 1].start;
  out.forEach((o) => { o.end = Math.min(o.end, duration); });
  return out;
}

/** Decodes an MP3/WAV to mono 16-bit PCM (via a WAV stream; Remotion's ffmpeg has no raw PCM muxer). */
const decode = (mp3: Buffer) => {
  const wav = ffmpeg(['-i', 'pipe:0', '-f', 'wav', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(SR), 'pipe:1'], mp3);
  let off = 12;
  while (off < wav.length - 8 && wav.toString('ascii', off, off + 4) !== 'data') off += 8 + wav.readUInt32LE(off + 4);
  const start = off + 8, bytes = (wav.length - start) & ~1;
  const pcm = new Int16Array(bytes / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = wav.readInt16LE(start + i * 2);
  return pcm;
};

async function episodeAudio(ep: Episode): Promise<Timeline> {
  // (ep is reassigned below once the line lengths are known)
  const lines = ep.beats.map((b) => spokenText(parseBeat(b)));
  const aligns: BeatAlignment[] = [];
  const pcm: Int16Array[] = [];
  const keyOf = (i: number) => {
    const text = lines[i];
    const prev = lines.slice(Math.max(0, i - 2), i).join(' ') || undefined;
    const next = lines[i + 1];
    const cfg = ENGINE === 'elevenlabs' ? { VOICE_ID, MODEL_ID, VOICE_SETTINGS, prev, next } : { KOKORO, v: 2 };
    return crypto.createHash('sha1').update(JSON.stringify({ ENGINE, cfg, text })).digest('hex').slice(0, 16);
  };
  const keys = lines.map((_, i) => keyOf(i));
  const audioOf = (i: number) => path.join(CACHE, `${keys[i]}.${ENGINE === 'elevenlabs' ? 'mp3' : 'wav'}`);
  const jsonOf = (i: number) => path.join(CACHE, `${keys[i]}.json`);
  const missing = lines.map((_, i) => i).filter((i) => FORCE || !fs.existsSync(audioOf(i)) || !fs.existsSync(jsonOf(i)));
  if (ENGINE === 'elevenlabs') {
    for (const i of missing) {
      console.log(`  line ${i + 1}/${lines.length}: ${lines[i]}`);
      const r = await synthesise(lines[i], lines.slice(Math.max(0, i - 2), i).join(' ') || undefined, lines[i + 1]);
      fs.writeFileSync(audioOf(i), Buffer.from(r.audio_base64, 'base64'));
      fs.writeFileSync(jsonOf(i), JSON.stringify({ alignment: r.alignment }));
    }
  } else if (missing.length) {
    if (!fs.existsSync(VOICE_PY)) throw new Error('The narrator voice is not installed yet. Run `npm run voice:setup` first.');
    console.log(`  synthesising ${missing.length} line(s) with the local voice…`);
    const job = {
      model: path.join(VOICE_DIR, 'kokoro-v1.0.onnx'),
      voices: path.join(VOICE_DIR, 'voices-v1.0.bin'),
      ...KOKORO,
      lines: missing.map((i) => ({ text: lines[i], words: parseBeat(ep.beats[i]).map((t) => t.spoken), out: audioOf(i) })),
    };
    const r = spawnSync(VOICE_PY, [path.join(ROOT, 'tts', 'narrate.py')], { input: JSON.stringify(job), maxBuffer: 1 << 26 });
    if (r.status !== 0) throw new Error('Local voice failed:\n' + r.stderr?.toString());
    const results = r.stdout.toString().trim().split('\n').map((l) => JSON.parse(l));
    missing.forEach((i, k) => fs.writeFileSync(jsonOf(i), JSON.stringify({ words: results[k].words })));
  }
  for (let i = 0; i < ep.beats.length; i++) {
    const cached = JSON.parse(fs.readFileSync(jsonOf(i), 'utf8'));
    const samples = decode(fs.readFileSync(audioOf(i)));
    const duration = samples.length / SR;
    const tokens = parseBeat(ep.beats[i]).map((t) => t.spoken);
    const timed = cached.words ?? (cached.alignment ? alignTokens(tokens, cached.alignment, duration) : mockAlignment({ ...ep, beats: [ep.beats[i]] })[0].tokens);
    aligns.push({ duration, tokens: timed });
    pcm.push(samples);
  }
  // if the narration is short, stretch the dramatic pauses (never the words) to reach the minimum length
  ep = fitPauses(ep, aligns);
  // assemble: line, pause, line, pause… (exactly the layout buildTimeline uses)
  const total = aligns.reduce((s, a, i) => s + a.duration + (ep.beats[i].pause ?? DEFAULT_PAUSE), 0);
  const out = new Int16Array(Math.ceil(total * SR) + SR);
  let cursor = 0;
  pcm.forEach((p, i) => {
    out.set(p, Math.round(cursor * SR));
    cursor += aligns[i].duration + (ep.beats[i].pause ?? DEFAULT_PAUSE);
  });
  const file = `ep${pad(ep.n)}.mp3`;
  const mp3 = ffmpeg(['-f', 's16le', '-ac', '1', '-ar', String(SR), '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1'], Buffer.from(out.buffer));
  fs.writeFileSync(path.join(AUDIO, file), mp3);
  fs.writeFileSync(path.join(PUBLIC_AUDIO, file), mp3);
  const tl = buildTimeline(ep, aligns, `audio/${file}`, false);
  fs.writeFileSync(path.join(AUDIO, `ep${pad(ep.n)}.json`), JSON.stringify({ episode: ep.n, title: ep.title, duration: tl.duration, words: tl.words.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })) }, null, 1));
  return tl;
}

function writeTimelines(all: Record<number, Timeline>) {
  const sorted = Object.fromEntries(Object.entries(all).sort((a, b) => +a[0] - +b[0]));
  fs.writeFileSync(
    DATA,
    `// AUTO-GENERATED by scripts/generate-audio.ts. Do not edit by hand.\nimport type { Timeline } from '../timeline/types';\n\nexport const TIMELINES: Record<number, Timeline> = ${JSON.stringify(sorted)};\n`,
  );
}

function readTimelines(): Record<number, Timeline> {
  try {
    const src = fs.readFileSync(DATA, 'utf8');
    const m = src.match(/TIMELINES: Record<number, Timeline> = (\{[\s\S]*\});\s*$/);
    return m ? JSON.parse(m[1]) : {};
  } catch {
    return {};
  }
}

(async () => {
  if (MOCK) {
    console.log('Estimated lengths (no API calls):');
    for (const ep of episodes) {
      const tl = buildTimeline(fitPauses(ep, mockAlignment(ep)), mockAlignment(ep), null, true);
      const flag = tl.duration < MIN_SECONDS || tl.duration > MAX_SECONDS ? '  <- outside target' : '';
      console.log(`  EP${pad(ep.n)} ${ep.title.padEnd(16)} ${tl.duration.toFixed(1)}s${flag}`);
    }
    return;
  }
  const problems = episodes.flatMap((e) => checkEpisode(e));
  if (problems.length) throw new Error('Shots do not match script/season1.md:\n' + problems.join('\n'));
  for (const d of [AUDIO, CACHE, PUBLIC_AUDIO]) fs.mkdirSync(d, { recursive: true });
  const all = readTimelines();
  for (const ep of episodes) {
    console.log(`EP${pad(ep.n)}: ${ep.title}`);
    const tl = await episodeAudio(ep);
    all[ep.n] = tl;
    writeTimelines(all);
    const flag = tl.duration < MIN_SECONDS || tl.duration > MAX_SECONDS ? `  (outside ${MIN_SECONDS}-${MAX_SECONDS}s, adjust the script)` : '';
    console.log(`  -> audio/ep${pad(ep.n)}.mp3, episode length ${tl.duration.toFixed(1)}s${flag}`);
  }
})().catch((e) => {
  console.error('\n' + (e instanceof Error ? e.message : e));
  process.exit(1);
});
