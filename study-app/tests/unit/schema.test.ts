import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { validateQuestionData } from "@/lib/quiz/schema";
import { QuizOutput, ReadPageOutput, SingleQuestionOutput } from "@/lib/ai/schemas";

describe("question validation", () => {
  it("accepts valid payloads and applies defaults", () => {
    const r = validateQuestionData("fill_blank", { prompt: "____ makes ATP", answer: "mitochondria" });
    expect(r.ok && r.data).toMatchObject({ accepted_answers: [] });
  });
  it("rejects bad payloads", () => {
    expect(validateQuestionData("multiple_choice", { prompt: "p", choices: ["a", "b"], answer_index: 5 }).ok).toBe(false);
    expect(validateQuestionData("multiple_choice", { prompt: "p", choices: ["a", "A"], answer_index: 0 }).ok).toBe(false);
    expect(validateQuestionData("fill_blank", { prompt: "no blank", answer: "x" }).ok).toBe(false);
    expect(validateQuestionData("essay", {}).ok).toBe(false);
  });
});

describe("AI output schemas", () => {
  it("convert to structured-output JSON schemas", () => {
    for (const s of [QuizOutput, ReadPageOutput, SingleQuestionOutput]) {
      const fmt = betaZodOutputFormat(s) as unknown as { type: string; schema: object };
      expect(fmt.type).toBe("json_schema");
      expect(JSON.stringify(fmt.schema)).toContain("properties");
    }
  });
});
