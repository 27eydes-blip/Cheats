import { describe, expect, it } from "vitest";
import { factorize, judgeNote, raterGroup, type Obs } from "@/lib/notes/bridging";

/**
 * A synthetic community with two camps. Each camp agrees with its own
 * side's partisan items and disagrees with the other's (these play the role
 * of past note ratings and story stances).
 */
function community(perCamp = 8, history = 10) {
  const obs: Obs[] = [];
  const A = Array.from({ length: perCamp }, (_, i) => `a${i}`);
  const B = Array.from({ length: perCamp }, (_, i) => `b${i}`);
  for (let k = 0; k < history; k++) {
    for (const u of A) obs.push({ rater: u, item: `pa${k}`, value: 1 }, { rater: u, item: `pb${k}`, value: 0 });
    for (const u of B) obs.push({ rater: u, item: `pa${k}`, value: 0 }, { rater: u, item: `pb${k}`, value: 1 });
  }
  return { obs, A, B };
}
const rate = (raters: string[], item: string, value: number) => raters.map((rater) => ({ rater, item, value }));
const verdict = (obs: Obs[], item: string, current: "needs_ratings" | "published" = "needs_ratings") => {
  const m = factorize(obs);
  return judgeNote(m, item, obs.filter((o) => o.item === item), current);
};

describe("bridging score", () => {
  it("finds the two viewpoint groups from past ratings", () => {
    const { obs, A, B } = community();
    const m = factorize(obs);
    const ga = new Set(A.map((u) => raterGroup(m, u)));
    const gb = new Set(B.map((u) => raterGroup(m, u)));
    expect(ga.size).toBe(1);
    expect(gb.size).toBe(1);
    expect([...ga][0]).toBe(-[...gb][0]);
    expect([...ga][0]).not.toBe(0);
  });

  it("publishes a note rated helpful by both groups", () => {
    const { obs, A, B } = community();
    const all = [...obs, ...rate(A.slice(0, 3), "note", 1), ...rate(B.slice(0, 3), "note", 1)];
    const v = verdict(all, "note");
    expect(v.status).toBe("published");
    expect(v.groups.a.n).toBe(3);
    expect(v.groups.b.n).toBe(3);
  });

  it("does not publish a note only one side likes, however many votes it gets", () => {
    const { obs, A, B } = community(12);
    const all = [...obs, ...rate(A, "note", 1), ...rate(B.slice(0, 3), "note", 0)];
    expect(verdict(all, "note").status).toBe("needs_ratings");
    const oneSided = [...obs, ...rate(A, "note2", 1)];
    expect(verdict(oneSided, "note2").status).toBe("needs_ratings"); // the other group never rated it
  });

  it("needs a minimum number of ratings and at least two raters per group", () => {
    const { obs, A, B } = community();
    expect(verdict([...obs, ...rate(A.slice(0, 1), "n", 1), ...rate(B.slice(0, 1), "n", 1)], "n").status).toBe("needs_ratings");
    expect(verdict([...obs, ...rate(A.slice(0, 4), "n", 1), ...rate(B.slice(0, 1), "n", 1)], "n").status).toBe("needs_ratings");
  });

  it("ignores raters without enough history", () => {
    const { obs, A } = community();
    const newcomers = ["x1", "x2", "x3", "x4"];
    const all = [...obs, ...rate(A.slice(0, 2), "n", 1), ...rate(newcomers, "n", 1)];
    const v = verdict(all, "n");
    expect(v.grouped).toBe(2);
    expect(v.status).toBe("needs_ratings");
  });

  it("counts Somewhat helpful as half", () => {
    const { obs, A, B } = community();
    const all = [...obs, ...rate(A.slice(0, 3), "n", 0.5), ...rate(B.slice(0, 3), "n", 1)];
    expect(verdict(all, "n").status).toBe("needs_ratings"); // group A average 0.5 < 0.6
    const all2 = [...obs, ...rate(A.slice(0, 2), "n", 0.5), ...rate(A.slice(2, 4), "n", 1), ...rate(B.slice(0, 3), "n", 1)];
    expect(verdict(all2, "n").status).toBe("published"); // A averages 0.75
  });

  it("can lose published status when later ratings change, without flickering", () => {
    const { obs, A, B } = community();
    const base = [...obs, ...rate(A.slice(0, 3), "n", 1), ...rate(B.slice(0, 3), "n", 1)];
    expect(verdict(base, "n").status).toBe("published");
    // One more lukewarm rating from group B: average 0.875, still published.
    expect(verdict([...base, ...rate(B.slice(3, 4), "n", 0.5)], "n", "published").status).toBe("published");
    // Group B turns against it: average falls below 0.5, it is unpublished.
    const later = [...base, ...rate(B.slice(3, 8), "n", 0)];
    expect(verdict(later, "n", "published").status).toBe("needs_ratings");
  });

  it("marks a note both groups reject as not helpful", () => {
    const { obs, A, B } = community();
    expect(verdict([...obs, ...rate(A.slice(0, 3), "n", 0), ...rate(B.slice(0, 3), "n", 0)], "n").status).toBe("not_helpful");
  });

  it("is deterministic", () => {
    const { obs, A, B } = community();
    const all = [...obs, ...rate(A.slice(0, 3), "n", 1), ...rate(B.slice(0, 3), "n", 1)];
    expect(verdict(all, "n")).toEqual(verdict(all, "n"));
  });
});
