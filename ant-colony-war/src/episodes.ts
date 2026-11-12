// Loads every episodes/epXX/scenes.json into the Remotion bundle.
import { toEpisode, type Episode, type EpisodeFile } from '../script/types';

declare const require: { context: (dir: string, deep: boolean, re: RegExp) => { keys: () => string[]; (k: string): EpisodeFile } };

const ctx = require.context('../episodes', true, /scenes\.json$/);
const byNumber = new Map<number, Episode>();
for (const k of ctx.keys()) {
  const ep = toEpisode(ctx(k));
  byNumber.set(ep.n, ep);
}
export const EPISODES: Episode[] = [...byNumber.values()].sort((a, b) => a.n - b.n);
