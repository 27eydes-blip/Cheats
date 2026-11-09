import type { QuestionType } from "@/lib/quiz/schema";

/**
 * Provider-neutral contract for every AI task in the app. Route handlers only
 * talk to this interface (via getAI() in ./index.ts), so swapping Claude for
 * another model means writing one new provider file.
 */
export interface AIProvider {
  readonly name: string;
  readNotesPage(input: ReadPageInput): Promise<ReadPageResult>;
  generateQuiz(input: GenerateQuizInput): Promise<GeneratedQuiz>;
  regenerateQuestion(input: RegenerateQuestionInput): Promise<GeneratedQuestion>;
  readHandwrittenAnswer(input: ReadAnswerInput): Promise<{ text: string }>;
}

export interface ImageInput {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 data with no data: prefix. */
  base64: string;
}

export interface SubjectContext {
  className?: string | null;
  subject?: string | null;
  topicName?: string | null;
}

export interface ReadPageInput {
  image?: ImageInput;
  /** Text that came with the file (PDF text layer / slide text), if any. */
  sourceText?: string | null;
  subject: SubjectContext;
  /** Prompt-ready summary of this student's past corrections. */
  handwritingProfile?: string;
  /** True if the student drew focus marks (highlighter color) on the image. */
  hasFocusMarks?: boolean;
  pageNumber: number;
  pageCount: number;
}

export interface ReadPageResult {
  /**
   * Markdown text of the page. Words the model is unsure about are wrapped
   * as [[best guess|alternative 1|alternative 2]].
   */
  text: string;
  /** Exact quotes of passages the student circled or highlighted. */
  focusQuotes: string[];
  suggestedTitle: string;
  legibility: "clear" | "messy" | "very_messy";
  model: string;
}

export interface NotesPageForQuiz {
  pageIndex: number;
  text: string;
  focusQuotes: string[];
}

export interface GenerateQuizInput {
  pages: NotesPageForQuiz[];
  subject: SubjectContext;
  types: QuestionType[];
  questionCount: number;
  /** Student's own words, e.g. "focus on the Krebs cycle". */
  instructions?: string;
}

export interface GeneratedConcept {
  kind: string;
  term: string;
  detail: string;
  page: number | null;
  quote: string | null;
}

export interface GeneratedQuestion {
  type: QuestionType;
  data: unknown;
  explanation: string;
  difficulty: number;
  conceptIndex: number | null;
  sourcePage: number | null;
  sourceQuote: string | null;
  isFocus: boolean;
}

export interface GeneratedQuiz {
  title: string;
  concepts: GeneratedConcept[];
  questions: GeneratedQuestion[];
  model: string;
}

export interface RegenerateQuestionInput {
  pages: NotesPageForQuiz[];
  subject: SubjectContext;
  current: { type: QuestionType; data: unknown; sourcePage: number | null; sourceQuote: string | null };
  /** Optional change of type, e.g. turn a flashcard into multiple choice. */
  type?: QuestionType;
  instructions?: string;
}

export interface ReadAnswerInput {
  image: ImageInput;
  questionPrompt: string;
  subject: SubjectContext;
  handwritingProfile?: string;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly code: "refused" | "truncated" | "invalid_output" | "unavailable" | "rate_limited",
  ) {
    super(message);
    this.name = "AIError";
  }
}
