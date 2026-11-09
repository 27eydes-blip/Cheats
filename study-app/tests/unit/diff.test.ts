import { describe, expect, it } from "vitest";
import { wordCorrections } from "@/lib/handwriting/diff";

describe("wordCorrections", () => {
  it("finds replaced words", () => {
    const r = wordCorrections("The male is a unit of amount.", "The mole is a unit of amount.");
    expect(r).toEqual([{ original: "male", corrected: "mole", context: expect.stringContaining("mole") }]);
  });
  it("ignores pure insertions, deletions and big rewrites", () => {
    expect(wordCorrections("a b c", "a b c d")).toEqual([]);
    expect(wordCorrections("a b c d", "a d")).toEqual([]);
    expect(wordCorrections("one two three four five", "six seven eight nine ten")).toEqual([]);
  });
  it("strips punctuation around words", () => {
    expect(wordCorrections("Ions: catian, anion.", "Ions: cation, anion.")[0]).toMatchObject({ original: "catian", corrected: "cation" });
  });
  it("handles multiple fixes", () => {
    expect(wordCorrections("x sodiam y atam z", "x sodium y atom z").map((c) => c.corrected)).toEqual(["sodium", "atom"]);
  });
});
