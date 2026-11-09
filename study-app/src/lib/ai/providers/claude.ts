import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  QUIZ_SYSTEM,
  READ_ANSWER_SYSTEM,
  READ_PAGE_SYSTEM,
  quizUserText,
  readPageUserText,
  regenerateUserText,
} from "../prompts";
import { QuizOutput, ReadAnswerOutput, ReadPageOutput, SingleQuestionOutput } from "../schemas";
import {
  AIError,
  type AIProvider,
  type GeneratedQuestion,
  type GeneratedQuiz,
  type GenerateQuizInput,
  type ImageInput,
  type ReadAnswerInput,
  type ReadPageInput,
  type ReadPageResult,
  type RegenerateQuestionInput,
} from "../types";
import { mapQuestion } from "../map";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Which model and effort each task uses. Change models here.
 * Reading messy handwriting benefits from more thinking, so it runs at "high".
 */
export const CLAUDE_TASKS = {
  readPage: { model: "claude-opus-5-5", effort: "high" as Effort, maxTokens: 32000 },
  generateQuiz: { model: "claude-opus-5-5", effort: "medium" as Effort, maxTokens: 64000 },
  regenerateQuestion: { model: "claude-opus-5-5", effort: "medium" as Effort, maxTokens: 16000 },
  readAnswer: { model: "claude-opus-5-5", effort: "low" as Effort, maxTokens: 4000 },
};

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

const schemaCache = new WeakMap<z.ZodType, { [k: string]: unknown }>();
/** JSON Schema for structured outputs, converted by the SDK's helper. */
function jsonSchemaFor(schema: z.ZodType): { [k: string]: unknown } {
  let out = schemaCache.get(schema);
  if (!out) {
    out = (betaZodOutputFormat(schema) as unknown as { schema: { [k: string]: unknown } }).schema;
    schemaCache.set(schema, out);
  }
  return out;
}

function imageBlock(img: ImageInput): ContentBlock {
  return { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } };
}

export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  private client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ maxRetries: 3 });
  }

  /** One structured-output call with refusal fallback and error mapping. */
  private async call<S extends z.ZodType>(args: {
    task: keyof typeof CLAUDE_TASKS;
    system: string;
    content: ContentBlock[];
    schema: S;
  }): Promise<{ output: z.infer<S>; model: string }> {
    const cfg = CLAUDE_TASKS[args.task];
    try {
      const stream = this.client.beta.messages.stream({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        // If the primary model declines, the API retries on a recommended
        // fallback model inside the same call.
        fallbacks: "default",
        thinking: { type: "adaptive" },
        // JSON-schema-constrained output. We parse it ourselves (below) so a
        // refusal or cut-off reply is reported clearly instead of as a parse error.
        output_config: { effort: cfg.effort, format: { type: "json_schema", schema: jsonSchemaFor(args.schema) } },
        // The system prompt is identical across students, so cache it.
        system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: args.content }],
      });
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") {
        throw new AIError("The AI declined to process this content.", "refused");
      }
      if (message.stop_reason === "max_tokens") {
        throw new AIError("The AI response was cut off. Try fewer pages or questions.", "truncated");
      }
      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AIError("The AI returned an unexpected format.", "invalid_output");
      }
      const parsed = args.schema.safeParse(json);
      if (!parsed.success) throw new AIError("The AI returned an unexpected format.", "invalid_output");
      return { output: parsed.data as z.infer<S>, model: message.model };
    } catch (err) {
      if (err instanceof AIError) throw err;
      if (err instanceof Anthropic.RateLimitError) {
        throw new AIError("The AI is busy right now. Try again in a moment.", "rate_limited");
      }
      if (err instanceof Anthropic.APIError) {
        console.error(`[ai] Claude API error ${err.status}:`, err.message);
        throw new AIError("The AI service is unavailable. Try again shortly.", "unavailable");
      }
      throw err;
    }
  }

  async readNotesPage(input: ReadPageInput): Promise<ReadPageResult> {
    const content: ContentBlock[] = [];
    if (input.image) content.push(imageBlock(input.image));
    content.push({ type: "text", text: readPageUserText(input) });
    const { output, model } = await this.call({
      task: "readPage",
      system: READ_PAGE_SYSTEM,
      content,
      schema: ReadPageOutput,
    });
    return {
      text: output.text,
      focusQuotes: output.focus_quotes,
      suggestedTitle: output.suggested_title,
      legibility: output.legibility,
      model,
    };
  }

  async generateQuiz(input: GenerateQuizInput): Promise<GeneratedQuiz> {
    const { output, model } = await this.call({
      task: "generateQuiz",
      system: QUIZ_SYSTEM,
      content: [{ type: "text", text: quizUserText(input) }],
      schema: QuizOutput,
    });
    return {
      title: output.title,
      concepts: output.concepts.map((c) => ({
        kind: c.kind,
        term: c.term,
        detail: c.detail,
        page: c.page == null ? null : c.page - 1,
        quote: c.quote,
      })),
      questions: output.questions.map(mapQuestion),
      model,
    };
  }

  async regenerateQuestion(input: RegenerateQuestionInput): Promise<GeneratedQuestion> {
    const type = input.type ?? input.current.type;
    const { output } = await this.call({
      task: "regenerateQuestion",
      system: QUIZ_SYSTEM,
      content: [
        {
          type: "text",
          text: regenerateUserText({
            pages: input.pages,
            subject: input.subject,
            currentJson: JSON.stringify(input.current),
            type,
            instructions: input.instructions,
          }),
        },
      ],
      schema: SingleQuestionOutput,
    });
    return { ...mapQuestion(output.question), type };
  }

  async readHandwrittenAnswer(input: ReadAnswerInput): Promise<{ text: string }> {
    const text = [
      `Question: ${input.questionPrompt}`,
      input.handwritingProfile ? `\nThis student's handwriting habits:\n${input.handwritingProfile}` : "",
      "\nTranscribe the handwritten answer.",
    ].join("\n");
    const { output } = await this.call({
      task: "readAnswer",
      system: READ_ANSWER_SYSTEM,
      content: [imageBlock(input.image), { type: "text", text }],
      schema: ReadAnswerOutput,
    });
    return { text: output.text };
  }
}
