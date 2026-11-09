import { describe, expect, it } from "vitest";
import { locateQuote } from "@/lib/quiz/source";

const page = "# Cells\n- The mitochondria is the powerhouse of the cell: it makes ATP.\n- DNA is stored in the nucleus.";

describe("locateQuote", () => {
  it("finds exact quotes", () => {
    const r = locateQuote(page, "DNA is stored in the nucleus");
    expect(page.slice(r!.start, r!.end)).toBe("DNA is stored in the nucleus");
  });
  it("ignores spacing and punctuation differences", () => {
    const r = locateQuote(page, "powerhouse of the cell  it makes ATP");
    expect(page.slice(r!.start, r!.end)).toBe("powerhouse of the cell: it makes ATP");
  });
  it("falls back to the longest matching run", () => {
    const r = locateQuote(page, "the mitochondria is the powerhouse of every cell");
    expect(page.slice(r!.start, r!.end)).toContain("mitochondria is the powerhouse of");
  });
  it("returns null when not found", () => {
    expect(locateQuote(page, "photosynthesis in leaves")).toBeNull();
    expect(locateQuote(page, null)).toBeNull();
  });
});
