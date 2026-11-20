/**
 * For You ranking: a transparent, rule-based score (no outside AI services).
 * Pure functions only, so every rule is unit-tested in tests/ranking.test.ts.
 *
 *   score = freshness × engagement × personal, then capped
 *
 * - freshness:  1 / (ageHours + 2)^1.25, so the feed keeps moving
 * - engagement: log of recency-weighted activity (likes/reactions, replies,
 *               shares, views; activity in the last 6h counts 3×, last 24h 1.5×)
 * - personal:   interests (topic, account, tags), social proof (people you
 *               follow reacted/replied), breaking news
 * - safety:     outrage damping (lots of replies + disagreement with little
 *               positive engagement does NOT climb), and a hard cap on how much
 *               any single item can be boosted over its freshness baseline
 */

export const TOPICS = ["politics", "markets", "sports", "tech", "world", "culture", "national"] as const;
export type Topic = (typeof TOPICS)[number];

/** Story section → feed topic. */
export const SECTION_TOPIC: Record<string, Topic> = {
  Politics: "politics", Business: "markets", Sports: "sports", Tech: "tech", World: "world", Culture: "culture", "Top Stories": "national",
};
/** Onboarding beat → feed topic. */
export const BEAT_TOPIC: Record<string, Topic> = {
  Politics: "politics", Elections: "politics", Markets: "markets", Business: "markets", Sports: "sports", Tech: "tech", Science: "tech", Gaming: "tech",
  World: "world", Entertainment: "culture", Music: "culture", Books: "culture", Food: "culture", Health: "national", Faith: "culture", Outdoors: "national", Cars: "markets",
};

export type Activity = {
  /** Positive reactions (likes / reactions / agree) with their age in hours. */
  positive: number[];
  replies: number[];
  shares: number[];
  views: number[];
  /** Disagree stances (used only for outrage damping, never as a boost). */
  negative: number;
};

export type Candidate = {
  id: string;
  type: "post" | "story";
  ageHours: number;
  authorId: string | null;
  topic: Topic | null;
  tags: string[];
  activity: Activity;
  /** How many accounts the viewer follows reacted to / replied to this item. */
  socialProof: number;
  breaking: boolean;
  /** Paid or promoted placement (always labeled; never boosted by the ranker). */
  promoted?: boolean;
};

export type Profile = {
  topics: Partial<Record<string, number>>;
  authors: Partial<Record<string, number>>;
  tags: Partial<Record<string, number>>;
  viewerId: string | null;
};

export const WEIGHTS = {
  positive: 1,
  reply: 1.5,
  share: 2.5,
  view: 0.04,
  /** recent activity multipliers */
  last6h: 3,
  last24h: 1.5,
  decayExp: 1.25,
  breaking: 1.6,
  socialPer: 0.25,
  socialMax: 1.0,
  interestMax: 1.5,
  interestMin: -0.85,
  /** Hard cap: no item can score more than this many times its freshness baseline. */
  maxBoost: 8,
} as const;

const recency = (ageH: number) => (ageH <= 6 ? WEIGHTS.last6h : ageH <= 24 ? WEIGHTS.last24h : 1);
const sumRecent = (ages: number[]) => ages.reduce((n, a) => n + recency(a), 0);

/** Recency-weighted engagement, before damping. */
export function engagementPoints(a: Activity): number {
  return WEIGHTS.positive * sumRecent(a.positive) + WEIGHTS.reply * sumRecent(a.replies) + WEIGHTS.share * sumRecent(a.shares) + WEIGHTS.view * sumRecent(a.views);
}

/**
 * Outrage damping: replies and disagreement far outweighing positive
 * engagement means a pile-on, not quality. Returns a multiplier in (0.35, 1].
 */
export function outrageDamping(a: Activity): number {
  const heat = a.replies.length + a.negative;
  const warmth = a.positive.length + a.shares.length + 1;
  const ratio = heat / warmth;
  if (ratio <= 2) return 1;
  return Math.max(0.35, 1 - (ratio - 2) * 0.15);
}

export function freshness(ageHours: number): number {
  return 1 / Math.pow(Math.max(0, ageHours) + 2, WEIGHTS.decayExp);
}

/** Interest affinity in [interestMin, interestMax]: topic + account (×1.5) + best matching tag. */
export function interestAffinity(c: Candidate, p: Profile): number {
  const topic = c.topic ? (p.topics[c.topic] ?? 0) : 0;
  const author = c.authorId ? (p.authors[c.authorId] ?? 0) : 0;
  const tag = c.tags.reduce((m, t) => Math.max(m, p.tags[t] ?? 0), 0);
  const raw = 0.25 * topic + 0.35 * author + 0.15 * tag;
  return Math.min(WEIGHTS.interestMax, Math.max(WEIGHTS.interestMin, raw));
}

export type Scored = { id: string; score: number; parts: { fresh: number; engagement: number; personal: number; damping: number; capped: boolean } };

export function scoreCandidate(c: Candidate, p: Profile): Scored {
  const fresh = freshness(c.ageHours);
  const damping = outrageDamping(c.activity);
  const engagement = 1 + Math.log2(1 + engagementPoints(c.activity) * damping);
  const social = Math.min(WEIGHTS.socialMax, c.socialProof * WEIGHTS.socialPer);
  const personal = (1 + interestAffinity(c, p)) * (1 + social) * (c.breaking ? WEIGHTS.breaking : 1) * (c.authorId && c.authorId === p.viewerId ? 0.3 : 1);
  let boost = engagement * personal;
  const capped = boost > WEIGHTS.maxBoost;
  if (capped) boost = WEIGHTS.maxBoost;
  // Promoted items never get ranking help: they sit at baseline freshness.
  if (c.promoted) boost = Math.min(boost, 1);
  return { id: c.id, score: fresh * boost, parts: { fresh, engagement, personal, damping, capped } };
}

/**
 * Variety pass over a score-sorted list:
 *  - never more than `maxRun` items in a row from the same account or topic
 *  - every `exploreEvery` slots, pull forward the best item from a topic the
 *    viewer hasn't shown interest in (so the feed doesn't get stale)
 */
export function diversify<T extends { id: string; authorId: string | null; topic: string | null }>(
  sorted: T[],
  opts: { maxRun?: number; exploreEvery?: number; knownTopics?: Set<string> } = {},
): T[] {
  const maxRun = opts.maxRun ?? 2;
  const exploreEvery = opts.exploreEvery ?? 6;
  const known = opts.knownTopics ?? new Set<string>();
  const pool = [...sorted];
  const out: T[] = [];
  const runOf = (key: (x: T) => string | null, v: string | null) => {
    if (!v) return 0;
    let n = 0;
    for (let i = out.length - 1; i >= 0 && key(out[i]) === v; i--) n++;
    return n;
  };
  const fits = (x: T) => runOf((y) => y.authorId, x.authorId) < maxRun && runOf((y) => y.topic, x.topic) < maxRun;
  while (pool.length) {
    let idx = -1;
    if (known.size && exploreEvery > 0 && (out.length + 1) % exploreEvery === 0) {
      idx = pool.findIndex((x) => x.topic && !known.has(x.topic) && fits(x));
    }
    if (idx < 0) idx = pool.findIndex(fits);
    if (idx < 0) idx = 0; // nothing fits: take the best and move on
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** Interest weights are clamped so one burst of clicks can't take over the feed. */
export const INTEREST_MIN = -4;
export const INTEREST_MAX = 6;
export const clampWeight = (w: number) => Math.min(INTEREST_MAX, Math.max(INTEREST_MIN, w));

/** How much each signal moves interests (topic / account). */
export const SIGNAL: Record<string, { topic: number; author: number }> = {
  view: { topic: 0.05, author: 0.02 },
  click: { topic: 0.3, author: 0.15 },
  dwell: { topic: 0.4, author: 0.2 },
  react: { topic: 0.5, author: 0.5 },
  reply: { topic: 0.6, author: 0.6 },
  share: { topic: 0.7, author: 0.6 },
  save: { topic: 0.6, author: 0.4 },
  follow: { topic: 0, author: 2 },
  showMore: { topic: 1.5, author: 1.2 },
  notInterested: { topic: -1.5, author: -1.5 },
  onboarding: { topic: 2, author: 0 },
};
