import { describe, expect, it } from "vitest";
import { contextAround, countUncertain, parseMarkers, resolveMarkers, serializeSegments } from "@/lib/handwriting/markers";

describe("uncertainty markers", () => {
  const raw = "The [[mitochondria|mitochondrion]] makes [[ATP]] in cells [[illegible]].";

  it("parses guesses and alternatives", () => {
    const segs = parseMarkers(raw);
    const unc = segs.filter((s) => s.kind === "uncertain");
    expect(unc).toHaveLength(3);
    expect(unc[0]).toMatchObject({ guess: "mitochondria", alternatives: ["mitochondrion"] });
    expect(unc[1]).toMatchObject({ guess: "ATP", alternatives: [] });
    expect(countUncertain(raw)).toBe(3);
  });

  it("resolves with chosen values and defaults to the guess", () => {
    expect(resolveMarkers(raw, { 0: "mitochondrion" })).toBe("The mitochondrion makes ATP in cells illegible.");
  });

  it("round-trips through serialize", () => {
    expect(serializeSegments(parseMarkers(raw))).toBe(raw);
  });

  it("leaves text without markers alone", () => {
    expect(resolveMarkers("plain [text] here")).toBe("plain [text] here");
  });

  it("gives context around a word", () => {
    const segs = parseMarkers(raw);
    expect(contextAround(segs, 1, 10)).toContain("mitochondria");
  });
});
