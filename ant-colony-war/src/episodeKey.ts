import type { Episode } from '../script/types';

const pad = (n: number) => String(n).padStart(2, '0');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Season 1 keeps its original names everywhere; later seasons are prefixed (s2-...). */
export const epKey = (ep: Pick<Episode, 'season' | 'n'>) => (ep.season === 1 ? String(ep.n) : `s${ep.season}-${ep.n}`);
export const compositionId = (ep: Pick<Episode, 'season' | 'n'>) => (ep.season === 1 ? `EP${pad(ep.n)}` : `S${ep.season}-EP${pad(ep.n)}`);
export const audioBase = (ep: Pick<Episode, 'season' | 'n'>) => (ep.season === 1 ? `ep${pad(ep.n)}` : `s${ep.season}-ep${pad(ep.n)}`);
export const outName = (ep: Pick<Episode, 'season' | 'n' | 'title'>) => `ant-colony-war-${ep.season === 1 ? '' : `s${ep.season}-`}ep${pad(ep.n)}-${slug(ep.title)}.mp4`;
