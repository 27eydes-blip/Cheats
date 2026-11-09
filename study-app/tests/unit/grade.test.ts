import { describe, expect, it } from "vitest";
import { answersMatch, grade, normalizeAnswer } from "@/lib/quiz/grade";
import type { Question } from "@/lib/quiz/schema";

const base = { id: "q", quiz_set_id: "s", concept_id: null, position: 0, explanation: null, difficulty: 2, source_page: 0, source_quote: null, is_focus: false, edited: false };

describe("grading", () => {
  it("normalizes answers", () => {
    expect(normalizeAnswer("  The Mitochondria! ")).toBe("mitochondria");
    expect(normalizeAnswer("$H_2O$")).toBe("h2o");
  });

  it("tolerates small typos but not on short words or numbers", () => {
    expect(answersMatch("mitocondria", "mitochondria")).toBe(true);
    expect(answersMatch("cat", "car")).toBe(false);
    expect(answersMatch("1776", "1767")).toBe(false);
    expect(answersMatch("1776", "1776")).toBe(true);
  });

  it("grades each type", () => {
    const mc = { ...base, type: "multiple_choice", data: { prompt: "p", choices: ["a", "b"], answer_index: 1 } } as Question;
    expect(grade(mc, { type: "multiple_choice", choice: 1 }).correct).toBe(true);
    expect(grade(mc, { type: "multiple_choice", choice: 0 }).correct).toBe(false);

    const tf = { ...base, type: "true_false", data: { statement: "s", answer: false } } as Question;
    expect(grade(tf, { type: "true_false", value: false }).correct).toBe(true);

    const fb = { ...base, type: "fill_blank", data: { prompt: "____ makes ATP", answer: "mitochondria", accepted_answers: ["mitochondrion"] } } as Question;
    expect(grade(fb, { type: "fill_blank", text: "Mitochondrion" }).correct).toBe(true);

    const sa = { ...base, type: "short_answer", data: { prompt: "why", answer: "Water moves to higher solute concentration", key_points: ["water moves", "higher solute concentration"] } } as Question;
    expect(grade(sa, { type: "short_answer", text: "the water moves toward the side with higher solute concentration" }).correct).toBe(true);
    const partial = grade(sa, { type: "short_answer", text: "water moves" });
    expect(partial.score).toBe(0.5);
    expect(partial.correct).toBe(false);

    const m = { ...base, type: "matching", data: { prompt: "m", pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] } } as Question;
    expect(grade(m, { type: "matching", pairs: { 0: 0, 1: 1 } }).correct).toBe(true);
    expect(grade(m, { type: "matching", pairs: { 0: 1, 1: 0 } }).score).toBe(0);
  });
});
