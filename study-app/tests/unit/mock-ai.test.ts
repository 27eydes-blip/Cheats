import { describe, expect, it } from "vitest";
import { MockProvider, MOCK_SAMPLE_PAGE } from "@/lib/ai/providers/mock";
import { validateQuestionData, QUESTION_TYPES } from "@/lib/quiz/schema";

describe("mock AI provider", () => {
  const ai = new MockProvider();
  it("reads a sample page with an uncertain word", async () => {
    const r = await ai.readNotesPage({ subject: {}, pageNumber: 1, pageCount: 1 });
    expect(r.text).toBe(MOCK_SAMPLE_PAGE);
    expect(r.text).toContain("[[");
  });
  it("generates valid questions of every type, linked to the notes", async () => {
    const quiz = await ai.generateQuiz({
      pages: [{ pageIndex: 0, text: MOCK_SAMPLE_PAGE, focusQuotes: [] }],
      subject: { className: "Biology" },
      types: [...QUESTION_TYPES],
      questionCount: 12,
    });
    expect(quiz.questions.length).toBe(12);
    for (const q of quiz.questions) {
      const v = validateQuestionData(q.type, q.data);
      expect(v.ok, `${q.type}: ${JSON.stringify(q.data)} ${!v.ok && v.error}`).toBe(true);
      expect(MOCK_SAMPLE_PAGE.replace(/\[\[(\w+)\|\w+\]\]/, "$1")).toContain(q.sourceQuote!.slice(0, 10));
    }
  });
});
