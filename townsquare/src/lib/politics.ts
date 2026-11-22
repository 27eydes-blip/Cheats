import { aiDeskPostIds as deskIds, beatsFor, coverageToday as today, opinionAcrossSpectrum as opinion, sectionStories, SECTIONS, type SectionStory } from "./sections";

/**
 * The Politics section. Since the other sections got the same treatment, the
 * code lives in sections.ts; these are the Politics-specific names kept for
 * existing callers.
 */
export { blindspots, sideHeadlines, type OpinionItem, type SideHeadline } from "./sections";

export const BEATS = SECTIONS.politics.beats;
export type Beat = keyof typeof BEATS;
export const BEAT_KEYS = Object.keys(BEATS) as Beat[];
export const isBeat = (s: string | undefined | null): s is Beat => !!s && s in BEATS;
export type PoliticsStory = SectionStory;

export const beatsOf = (text: string) => beatsFor(SECTIONS.politics, text) as Beat[];
export const politicsStories = (opts: { limit?: number; beat?: Beat | null; viewerId?: string | null } = {}) => sectionStories("politics", opts);
export const opinionAcrossSpectrum = (perSide = 3, t?: number) => opinion("politics", perSide, t);
export const coverageToday = (t?: number) => today("politics", t);
export const aiDeskPostIds = (limit = 3) => deskIds("politics", limit);
