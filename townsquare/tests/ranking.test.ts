import { describe, expect, it } from "vitest";
import { clampWeight, diversify, engagementPoints, freshness, interestAffinity, outrageDamping, scoreCandidate, WEIGHTS, type Candidate, type Profile } from "@/lib/ranking";

const quiet = { positive: [], replies: [], shares: [], views: [], negative: 0 };
const base = (over: Partial<Candidate> = {}): Candidate => ({ id: "x", type: "post", ageHours: 2, authorId: "a", topic: "politics", tags: [], activity: quiet, socialProof: 0, breaking: false, ...over });
const nobody: Profile = { topics: {}, authors: {}, tags: {}, viewerId: null };

describe("ranking: engagement and freshness", () => {
  it("counts recent activity more than old activity", () => {
    const recent = engagementPoints({ ...quiet, positive: [1, 2, 3] });
    const old = engagementPoints({ ...quiet, positive: [50, 60, 70] });
    expect(recent).toBeGreaterThan(old * 2);
  });
  it("weights shares > replies > likes > views", () => {
    const one = (k: keyof typeof quiet) => engagementPoints({ ...quiet, [k]: [30] });
    expect(one("shares")).toBeGreaterThan(one("replies"));
    expect(one("replies")).toBeGreaterThan(one("positive"));
    expect(one("positive")).toBeGreaterThan(one("views"));
  });
  it("decays over time", () => {
    expect(freshness(1)).toBeGreaterThan(freshness(10));
    expect(freshness(10)).toBeGreaterThan(freshness(100));
    const fresh = scoreCandidate(base({ ageHours: 1, activity: { ...quiet, positive: [1, 1] } }), nobody).score;
    const stale = scoreCandidate(base({ ageHours: 72, activity: { ...quiet, positive: [1, 1] } }), nobody).score;
    expect(fresh).toBeGreaterThan(stale);
  });
});

describe("ranking: personal signals", () => {
  it("boosts topics and accounts the viewer likes, and sinks ones they don't", () => {
    const fan: Profile = { topics: { politics: 4 }, authors: { a: 3 }, tags: {}, viewerId: "v" };
    const hater: Profile = { topics: { politics: -4 }, authors: { a: -4 }, tags: {}, viewerId: "v" };
    const s = (p: Profile) => scoreCandidate(base(), p).score;
    expect(s(fan)).toBeGreaterThan(s(nobody));
    expect(s(hater)).toBeLessThan(s(nobody));
  });
  it("clamps interest affinity", () => {
    const extreme: Profile = { topics: { politics: 999 }, authors: { a: 999 }, tags: { x: 999 }, viewerId: "v" };
    expect(interestAffinity(base({ tags: ["x"] }), extreme)).toBe(WEIGHTS.interestMax);
    expect(clampWeight(999)).toBe(6);
    expect(clampWeight(-999)).toBe(-4);
  });
  it("gives social proof and breaking news a boost", () => {
    const plain = scoreCandidate(base(), nobody).score;
    expect(scoreCandidate(base({ socialProof: 2 }), nobody).score).toBeGreaterThan(plain);
    expect(scoreCandidate(base({ breaking: true }), nobody).score).toBeGreaterThan(plain);
  });
  it("social proof is capped", () => {
    const a = scoreCandidate(base({ socialProof: 4 }), nobody).score;
    const b = scoreCandidate(base({ socialProof: 400 }), nobody).score;
    expect(b).toBeCloseTo(a, 10);
  });
});

describe("ranking: safety", () => {
  it("does not let outrage alone climb", () => {
    const pileOn = { ...quiet, replies: Array(40).fill(1), negative: 60, positive: [1] };
    const liked = { ...quiet, replies: Array(10).fill(1), positive: Array(20).fill(1) };
    expect(outrageDamping(pileOn)).toBeLessThan(0.5);
    expect(outrageDamping(liked)).toBe(1);
    // A pile-on with more raw activity still ranks below a well-liked post of similar size.
    expect(scoreCandidate(base({ activity: pileOn }), nobody).score).toBeLessThan(scoreCandidate(base({ activity: liked }), nobody).score);
  });
  it("caps how much any single item can be boosted", () => {
    const viral = { ...quiet, positive: Array(100000).fill(1), shares: Array(50000).fill(1) };
    const s = scoreCandidate(base({ activity: viral, breaking: true, socialProof: 99 }), { topics: { politics: 6 }, authors: { a: 6 }, tags: {}, viewerId: "v" });
    expect(s.parts.capped).toBe(true);
    expect(s.score / s.parts.fresh).toBeLessThanOrEqual(WEIGHTS.maxBoost + 1e-9);
  });
  it("never boosts promoted items", () => {
    const busy = { ...quiet, positive: Array(50).fill(1) };
    const s = scoreCandidate(base({ activity: busy, promoted: true, breaking: true }), nobody);
    expect(s.score).toBeCloseTo(s.parts.fresh, 10);
  });
  it("down-ranks your own posts in your For You", () => {
    expect(scoreCandidate(base({ authorId: "v" }), { ...nobody, viewerId: "v" }).score).toBeLessThan(scoreCandidate(base(), { ...nobody, viewerId: "v" }).score);
  });
});

describe("ranking: variety", () => {
  const item = (id: string, authorId: string, topic: string) => ({ id, authorId, topic });
  it("never shows more than two in a row from the same account or topic", () => {
    const sorted = [item("1", "a", "t1"), item("2", "a", "t2"), item("3", "a", "t3"), item("4", "b", "t1"), item("5", "c", "t1"), item("6", "d", "t1"), item("7", "e", "t2"), item("8", "f", "t3")];
    const out = diversify(sorted, { exploreEvery: 0 });
    for (let i = 2; i < out.length; i++) {
      expect(out[i].authorId === out[i - 1].authorId && out[i].authorId === out[i - 2].authorId).toBe(false);
      expect(out[i].topic === out[i - 1].topic && out[i].topic === out[i - 2].topic).toBe(false);
    }
    expect(out).toHaveLength(sorted.length);
  });
  it("mixes in a topic the viewer hasn't shown interest in", () => {
    const sorted = Array.from({ length: 10 }, (_, i) => item(`p${i}`, `u${i}`, i % 2 ? "politics" : "markets")).concat(item("new", "z", "sports"));
    const out = diversify(sorted, { exploreEvery: 3, knownTopics: new Set(["politics", "markets"]) });
    expect(out.findIndex((x) => x.id === "new")).toBe(2);
  });
});
