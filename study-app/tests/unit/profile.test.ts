import { describe, expect, it } from "vitest";
import { buildProfile, letterSubstitutions, profileToPrompt } from "@/lib/handwriting/profile";

describe("handwriting profile", () => {
  it("finds letter substitutions", () => {
    expect(letterSubstitutions("clorine", "chlorine")).toEqual([]); // insertion only
    expect(letterSubstitutions("male", "mole")).toEqual([["o", "a"]]);
    expect(letterSubstitutions("cat", "elephant")).toEqual([]); // rewrite, not a misread
  });

  it("aggregates repeated fixes and letter habits", () => {
    const rows = [
      { original: "male", corrected: "mole", class_id: "chem" },
      { original: "male", corrected: "mole", class_id: "chem" },
      { original: "sodiam", corrected: "sodium", class_id: "chem" },
      { original: "atam", corrected: "atom", class_id: "chem" },
      { original: "Nat", corrected: "Na+", class_id: "chem" },
      { original: "x", corrected: "x" },
    ];
    const p = buildProfile(rows, "chem");
    expect(p.wordFixes[0]).toMatchObject({ from: "male", to: "mole", count: 2 });
    expect(p.letterConfusions.find((l) => l.written === "o" && l.misreadAs === "a")?.count).toBe(3);
    expect(p.vocabulary).toContain("sodium");
    const prompt = profileToPrompt(p);
    expect(prompt).toContain('"male" → "mole" (2x)');
    expect(prompt).toContain('their "o" has been misread as "a"');
  });

  it("weights the current class first", () => {
    const rows = [
      { original: "cel", corrected: "cell", class_id: "bio" },
      { original: "ion", corrected: "iron", class_id: "chem" },
    ];
    expect(buildProfile(rows, "chem").wordFixes[0].to).toBe("iron");
    expect(buildProfile(rows, "bio").wordFixes[0].to).toBe("cell");
  });

  it("is empty with no corrections", () => {
    expect(profileToPrompt(buildProfile([]))).toBe("");
  });
});
