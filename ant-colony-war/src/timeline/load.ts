import type { Episode } from '../../script/types';
import { TIMELINES } from '../data/timelines';
import { buildTimeline, mockAlignment } from './build';
import type { Timeline } from './types';

/** The generated timeline for an episode, or a silent estimate when audio has not been generated yet. */
export const getTimeline = (ep: Episode): Timeline => TIMELINES[ep.n] ?? buildTimeline(ep, mockAlignment(ep), null, true);
