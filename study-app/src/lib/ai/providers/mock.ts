import type { QuestionType } from "@/lib/quiz/schema";
import { resolveMarkers } from "@/lib/handwriting/markers";
import type {
  AIProvider,
  GeneratedConcept,
  GeneratedQuestion,
  GeneratedQuiz,
  GenerateQuizInput,
  ReadAnswerInput,
  ReadPageInput,
  ReadPageResult,
  RegenerateQuestionInput,
} from "../types";

/**
 * Offline provider for local development and automated tests. It never calls
 * a network service. Reading returns the embedded text (or a sample page with
 * one uncertain word); quizzes are built from "term: definition" / "X is Y"
 * lines with simple rules, so the whole app can be exercised end to end.
 */

export const MOCK_SAMPLE_PAGE = `# Cell Biology
- The [[mitochondria|mitochondrion]] is the powerhouse of the cell: it makes ATP.
- Ribosome: builds proteins from amino acids.
- Photosynthesis happens in the chloroplast.
- DNA is stored in the nucleus.
- Osmosis is the movement of water across a membrane.`;

interface Fact {
  term: string;
  detail: string;
  page: number;
  quote: string;
}

function extractFacts(input: GenerateQuizInput): Fact[] {
  const facts: Fact[] = [];
  for (const p of input.pages) {
    for (const rawLine of resolveMarkers(p.text).split("\n")) {
      const line = rawLine.replace(/^[\s>*#-]+|\d+\.\s+/, "").trim();
      if (line.length < 8) continue;
      let m = line.match(/^([^:]{2,60}):\s*(.{3,})$/);
      if (m) {
        facts.push({ term: m[1].trim(), detail: m[2].trim().replace(/\.$/, ""), page: p.pageIndex, quote: line });
        continue;
      }
      m = line.match(/^(?:The\s+)?(.{2,50}?)\s+(is|are|was|were|happens in|makes)\s+(.{3,})$/i);
      if (m) facts.push({ term: m[1].trim(), detail: `${m[2]} ${m[3]}`.replace(/\.$/, ""), page: p.pageIndex, quote: line });
    }
  }
  return facts;
}

function makeQuestion(type: QuestionType, f: Fact, idx: number, all: Fact[]): GeneratedQuestion {
  const others = all.filter((o) => o.term !== f.term);
  const base = {
    explanation: `From your notes: "${f.quote}"`,
    difficulty: 1 + (idx % 3),
    conceptIndex: all.indexOf(f),
    sourcePage: f.page,
    sourceQuote: f.quote,
    isFocus: false,
  };
  switch (type) {
    case "multiple_choice": {
      const distractors = others.slice(0, 3).map((o) => o.term);
      while (distractors.length < 3) distractors.push(["None of these", "Not in the notes", "Unknown"][distractors.length]);
      const choices = [f.term, ...distractors];
      const answer = idx % choices.length;
      [choices[0], choices[answer]] = [choices[answer], choices[0]];
      return { ...base, type, data: { prompt: `Which term matches: ${f.detail}?`, choices, answer_index: answer } };
    }
    case "flashcard":
      return { ...base, type, data: { front: f.term, back: f.detail } };
    case "fill_blank":
      return { ...base, type, data: { prompt: `____: ${f.detail}`, answer: f.term, accepted_answers: [] } };
    case "true_false": {
      const lie = others[0] && idx % 2 === 1;
      return {
        ...base,
        type,
        data: { statement: `${lie ? others[0].term : f.term}: ${f.detail}`, answer: !lie },
      };
    }
    case "short_answer":
      return {
        ...base,
        type,
        data: { prompt: `Explain: ${f.term}`, answer: f.detail, key_points: [f.detail.split(/\s+/).slice(0, 4).join(" ")] },
      };
    case "matching":
      return {
        ...base,
        type,
        data: {
          prompt: "Match each term to its meaning",
          pairs: [f, ...others].slice(0, 4).map((o) => ({ left: o.term, right: o.detail })),
        },
      };
  }
}

export class MockProvider implements AIProvider {
  readonly name = "mock";

  async readNotesPage(input: ReadPageInput): Promise<ReadPageResult> {
    const text = input.sourceText?.trim() ? input.sourceText.trim() : MOCK_SAMPLE_PAGE;
    return {
      text,
      focusQuotes: [],
      suggestedTitle: input.subject.topicName || text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60) || "Notes",
      legibility: "messy",
      model: "mock",
    };
  }

  async generateQuiz(input: GenerateQuizInput): Promise<GeneratedQuiz> {
    const facts = extractFacts(input);
    const concepts: GeneratedConcept[] = facts.map((f) => ({
      kind: "definition",
      term: f.term,
      detail: f.detail,
      page: f.page,
      quote: f.quote,
    }));
    const questions: GeneratedQuestion[] = [];
    if (facts.length) {
      for (let i = 0; i < input.questionCount; i++) {
        const type = input.types[i % input.types.length];
        if (type === "matching" && facts.length < 2) continue;
        questions.push(makeQuestion(type, facts[i % facts.length], i, facts));
      }
    }
    const firstHeading = input.pages[0]?.text.match(/^#+\s*(.+)$/m)?.[1];
    return { title: input.subject.topicName || firstHeading || "Practice quiz", concepts, questions, model: "mock" };
  }

  async regenerateQuestion(input: RegenerateQuestionInput): Promise<GeneratedQuestion> {
    const quiz = await this.generateQuiz({
      pages: input.pages,
      subject: input.subject,
      types: [input.type ?? input.current.type],
      questionCount: 6,
    });
    const fresh = quiz.questions.find((q) => JSON.stringify(q.data) !== JSON.stringify(input.current.data));
    if (!fresh) throw new Error("Nothing new to generate from these notes.");
    return fresh;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readHandwrittenAnswer(_input: ReadAnswerInput): Promise<{ text: string }> {
    return { text: "mitochondria" };
  }
}
