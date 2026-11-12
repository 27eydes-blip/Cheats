// Node-side loading and validation of episodes/epXX/scenes.json against script/season1.md.
import fs from 'node:fs';
import path from 'node:path';
import { toEpisode, type Episode, type EpisodeFile } from '../../script/types';
import { parseBeat } from '../../src/timeline/parse';

const ROOT = path.join(__dirname, '..', '..');

/** Season 1 lives in episodes/epXX, later seasons in episodes/sN/epXX. */
export function loadEpisodes(): Episode[] {
  const dir = path.join(ROOT, 'episodes');
  const dirs = fs.readdirSync(dir).flatMap((d) => (/^s\d+$/.test(d) ? fs.readdirSync(path.join(dir, d)).map((e) => path.join(dir, d, e)) : [path.join(dir, d)]));
  return dirs
    .filter((d) => fs.existsSync(path.join(d, 'scenes.json')))
    .map((d) => toEpisode(JSON.parse(fs.readFileSync(path.join(d, 'scenes.json'), 'utf8')) as EpisodeFile))
    .sort((a, b) => a.season - b.season || a.n - b.n);
}

/** CLI selection: `s2` picks a season, numbers pick episodes (numbers alone = season 1). */
export function selectEpisodes(args: string[], all = loadEpisodes()): Episode[] {
  const season = Number(args.find((a) => /^s\d+$/i.test(a))?.slice(1)) || 0;
  const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
  return all.filter((e) => (season ? e.season === season : nums.length ? e.season === 1 : true) && (!nums.length || nums.includes(e.n)));
}

/** Episode number -> { title, text } from script/season1.md. */
export function loadScript(season = 1): Map<number, { title: string; text: string }> {
  const src = fs.readFileSync(path.join(ROOT, 'script', `season${season}.md`), 'utf8');
  const out = new Map<number, { title: string; text: string }>();
  // heading: EPISODE 10 — "MY COLONY" (SEASON FINALE)  -> anything after the quoted title is ignored
  const re = /^EPISODE\s+(\d+)\s+[—-]+\s+"([^"]+)"[^\n]*\n([\s\S]*?)(?=\n\s*EPISODE\s+\d+|\s*$)/gm;
  for (const m of src.matchAll(re)) out.set(+m[1], { title: m[2], text: m[3].replace(/\s+/g, ' ').trim() });
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Returns a list of problems (empty = the shots match the script word for word). */
export function checkEpisode(ep: Episode, script = loadScript(ep.season)): string[] {
  const s = script.get(ep.n);
  if (!s) return [`S${ep.season} EP${ep.n}: not found in script/season${ep.season}.md`];
  const problems: string[] = [];
  if (ep.title.toUpperCase() !== s.title.toUpperCase()) problems.push(`EP${ep.n}: title "${ep.title}" should be "${s.title}"`);
  const shots = norm(ep.beats.map((b) => parseBeat(b).map((t) => t.display).join(' ')).join(' '));
  const want = norm(s.text.replace(/[[\]]/g, ''));
  if (shots !== want) {
    const a = shots.split(' '), b = want.split(' ');
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    problems.push(`EP${ep.n}: narration differs from the script at word ${i + 1}:\n    shots:  …${a.slice(Math.max(0, i - 4), i + 6).join(' ')}\n    script: …${b.slice(Math.max(0, i - 4), i + 6).join(' ')}`);
  }
  return problems;
}
