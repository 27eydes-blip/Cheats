// Loads every episodes/epXX/scenes.json into the Remotion bundle.
import { toEpisode, type Episode, type EpisodeFile } from '../script/types';

declare const require: { context: (dir: string, deep: boolean, re: RegExp) => { keys: () => string[]; (k: string): EpisodeFile } };

const ctx = require.context('../episodes', true, /scenes\.json$/);
const byKey = new Map<string, Episode>();
for (const k of ctx.keys()) {
  const ep = toEpisode(ctx(k));
  byKey.set(`${ep.season}-${ep.n}`, ep);
}
export const EPISODES: Episode[] = [...byKey.values()].sort((a, b) => a.season - b.season || a.n - b.n);
