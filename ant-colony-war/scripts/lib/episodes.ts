// Node-side loading and validation of episodes/epXX/scenes.json against script/season1.md.
import fs from 'node:fs';
import path from 'node:path';
import { toEpisode, type Episode, type EpisodeFile } from '../../script/types';
import { parseBeat } from '../../src/timeline/parse';

const ROOT = path.join(__dirname, '..', '..');

export function loadEpisodes(): Episode[] {
  const dir = path.join(ROOT, 'episodes');
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'scenes.json')))
    .map((d) => toEpisode(JSON.parse(fs.readFileSync(path.join(dir, d, 'scenes.json'), 'utf8')) as EpisodeFile))
    .sort((a, b) => a.n - b.n);
}

/** Episode number -> { title, text } from script/season1.md. */
export function loadScript(): Map<number, { title: string; text: string }> {
  const src = fs.readFileSync(path.join(ROOT, 'script', 'season1.md'), 'utf8');
  const out = new Map<number, { title: string; text: string }>();
  const re = /^EPISODE\s+(\d+)\s+[—-]+\s+"([^"]+)"\s*\n([\s\S]*?)(?=\n\s*EPISODE\s+\d+|\s*$)/gm;
  for (const m of src.matchAll(re)) out.set(+m[1], { title: m[2], text: m[3].replace(/\s+/g, ' ').trim() });
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Returns a list of problems (empty = the shots match the script word for word). */
export function checkEpisode(ep: Episode, script = loadScript()): string[] {
  const s = script.get(ep.n);
  if (!s) return [`EP${ep.n}: not found in script/season1.md`];
  const problems: string[] = [];
  if (ep.title.toUpperCase() !== s.title.toUpperCase()) problems.push(`EP${ep.n}: title "${ep.title}" should be "${s.title}"`);
  const shots = norm(ep.beats.map((b) => parseBeat(b).map((t) => t.display).join(' ')).join(' '));
  const want = norm(s.text);
  if (shots !== want) {
    const a = shots.split(' '), b = want.split(' ');
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    problems.push(`EP${ep.n}: narration differs from the script at word ${i + 1}:\n    shots:  …${a.slice(Math.max(0, i - 4), i + 6).join(' ')}\n    script: …${b.slice(Math.max(0, i - 4), i + 6).join(' ')}`);
  }
  return problems;
}
