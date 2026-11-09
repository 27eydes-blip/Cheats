import { QUESTION_TYPE_LABELS, type QuestionType } from "@/lib/quiz/schema";
import type { NotesPageForQuiz, ReadPageInput, SubjectContext } from "./types";

/**
 * Prompt text shared by all providers. Kept stable (no timestamps or IDs) so
 * the system prompts cache well.
 */

export const FOCUS_MARK_COLOR = "magenta/pink (#ff00d4, often semi-transparent like a highlighter)";

export function subjectLine(s: SubjectContext): string {
  const parts = [
    s.className && `Class: ${s.className}`,
    s.subject && `Subject: ${s.subject}`,
    s.topicName && `Topic: ${s.topicName}`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "Class and topic: not given. Infer the subject from the content.";
}

export const READ_PAGE_SYSTEM = `You transcribe a student's class notes from a photo so they can be turned into quizzes. The notes may be handwritten (often very messy, cursive, or mixed with print), printed, a whiteboard, or a slide.

How to read:
- Read words in context. When a letter shape is ambiguous, use the surrounding sentence and the class subject to decide (e.g. in chemistry notes, "Na+" not "Nat", "mole" not "male").
- Keep the student's structure: headings as "#"/"##", bullet lists as "-", numbered lists, arrows as "→", and tables as Markdown tables.
- Write math in LaTeX inside $...$ (inline) or $$...$$ (display). Chemical formulas also go in LaTeX, e.g. $H_2O$.
- For diagrams, write one line: "[Diagram: short description of what it shows, including its labels]".
- Ignore doodles, crossed-out text, and page artifacts (holes, ruled lines, fingers).
- Do not add facts that aren't on the page and do not fix the student's content errors; only transcribe.

Marking uncertainty (important):
- When you are not confident about a word, wrap it as [[best guess|alternative|alternative]]. Give 0-2 alternatives. Example: "The [[mitochondria|mitochondrion]] makes ATP".
- Only mark words you are genuinely unsure of. Do not mark words you can read clearly.
- If a whole passage is illegible, write [[illegible]].

Focus marks: if the student drew marks in bright ${FOCUS_MARK_COLOR} (circles, boxes, highlights, stars), those are the parts they want to be quizzed on harder. Copy the exact transcribed text of each marked passage into focus_quotes. The magenta marks themselves are not part of the notes.

Also return a short suggested_title (max 8 words) for these notes and a legibility rating.`;

export function readPageUserText(input: ReadPageInput): string {
  const lines = [
    subjectLine(input.subject),
    `Page ${input.pageNumber} of ${input.pageCount}.`,
  ];
  if (input.handwritingProfile) {
    lines.push(
      "",
      "What we have learned about this student's handwriting from their past corrections (use it to read ambiguous words):",
      input.handwritingProfile,
    );
  }
  if (input.sourceText?.trim()) {
    lines.push(
      "",
      "The file also contained this embedded text. It may be incomplete or out of order; use it to check your reading, and prefer what is visible on the page:",
      "<embedded_text>",
      input.sourceText.slice(0, 20000),
      "</embedded_text>",
    );
  }
  if (!input.image) {
    lines.push("", "There is no image for this page. Clean up and structure the embedded text as notes.");
  }
  if (input.hasFocusMarks) {
    lines.push("", `The student drew focus marks in ${FOCUS_MARK_COLOR} on this page.`);
  }
  lines.push("", "Transcribe the page.");
  return lines.join("\n");
}

const TYPE_GUIDE: Record<QuestionType, string> = {
  multiple_choice:
    'multiple_choice: data = {prompt, choices (4 options, one correct), answer_index}. Wrong choices must be plausible mistakes a student would make, drawn from the same notes where possible. Never use "all of the above".',
  flashcard: "flashcard: data = {front, back}. Front is a term, question or cue; back is a short, complete answer.",
  fill_blank:
    'fill_blank: data = {prompt, answer, accepted_answers}. The prompt is a sentence from the notes with the key word replaced by "____" (four underscores, exactly once). accepted_answers lists other spellings or synonyms that should also count.',
  true_false:
    "true_false: data = {statement, answer}. False statements should change one important detail of a true fact (a date, a term, a direction), not be obviously silly.",
  short_answer:
    "short_answer: data = {prompt, answer, key_points}. answer is a model answer in 1-3 sentences; key_points are the 1-4 ideas a correct answer must contain.",
  matching:
    "matching: data = {prompt, pairs}. 3-6 pairs of {left, right}, e.g. term → definition. Each right side must match only one left side.",
};

export const QUIZ_SYSTEM = `You are an expert teacher who writes study quizzes from a student's own class notes.

Step 1 - pull out what matters: key concepts, definitions, dates, formulas, vocabulary, people and processes. Each concept gets a kind, a term, a one-sentence detail, the page it came from, and an exact quote (copied character-for-character from the notes, 3-25 words) that it came from.

Step 2 - write questions that test understanding, not just recall of wording:
- Every question must be answerable from the notes alone. Never test facts that are not in the notes.
- Every question links back to its source: source_page and an exact source_quote copied from that page.
- Mix difficulty: 1 = recall, 2 = understanding, 3 = application or comparing ideas.
- Cover the whole set of notes, not just the first page. Do not ask the same thing twice.
- Passages the student marked as focus are the most important: write more and harder questions about them and set is_focus = true on those questions.
- explanation: 1-2 sentences on why the answer is right, pointing to the notes.
- Write math in LaTeX inside $...$.
- concept_index points at the concept the question tests (or null).

Question formats:
${Object.values(TYPE_GUIDE).map((g) => `- ${g}`).join("\n")}`;

export function notesBlock(pages: NotesPageForQuiz[]): string {
  return pages
    .map((p) => {
      const focus = p.focusQuotes.length
        ? `\n<focus_passages>\n${p.focusQuotes.map((q) => `- ${q}`).join("\n")}\n</focus_passages>`
        : "";
      return `<page number="${p.pageIndex + 1}">\n${p.text}\n</page>${focus}`;
    })
    .join("\n\n");
}

export function quizUserText(args: {
  pages: NotesPageForQuiz[];
  subject: SubjectContext;
  types: QuestionType[];
  questionCount: number;
  instructions?: string;
}): string {
  const typeList = args.types.map((t) => `${t} (${QUESTION_TYPE_LABELS[t]})`).join(", ");
  return [
    subjectLine(args.subject),
    "",
    "<notes>",
    notesBlock(args.pages),
    "</notes>",
    "",
    `Write about ${args.questionCount} questions using only these formats: ${typeList}. Spread them across the formats.`,
    "Page numbers in source_page are 1-based, matching the <page number> tags.",
    args.instructions ? `The student asked: "${args.instructions.slice(0, 500)}"` : "",
    "Also give the quiz a short title (max 8 words).",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function regenerateUserText(args: {
  pages: NotesPageForQuiz[];
  subject: SubjectContext;
  currentJson: string;
  type: QuestionType;
  instructions?: string;
}): string {
  return [
    subjectLine(args.subject),
    "",
    "<notes>",
    notesBlock(args.pages),
    "</notes>",
    "",
    "The student wants a better version of this question:",
    args.currentJson,
    "",
    `Write one new ${args.type} question that tests the same idea in a fresh way (or a nearby idea from the notes if the original was poor).`,
    args.instructions ? `The student asked: "${args.instructions.slice(0, 500)}"` : "",
    "Page numbers in source_page are 1-based.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export const READ_ANSWER_SYSTEM = `You read a student's handwritten answer to a quiz question. Transcribe exactly what they wrote, including mistakes; do not correct or complete it. Math goes in LaTeX inside $...$. If nothing is written, return an empty string.`;
