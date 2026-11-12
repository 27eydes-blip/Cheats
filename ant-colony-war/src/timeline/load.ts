import type { Episode } from '../../script/types';
import { TIMELINES } from '../data/timelines';
import { buildTimeline, fitPauses, mockAlignment } from './build';
import type { Timeline } from './types';
import { epKey } from '../episodeKey';

/** The generated timeline for an episode, or a silent estimate when audio has not been generated yet. */
export const getTimeline = (ep: Episode): Timeline => TIMELINES[epKey(ep)] ?? buildTimeline(fitPauses(ep, mockAlignment(ep)), mockAlignment(ep), null, true);
