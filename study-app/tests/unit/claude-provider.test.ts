import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeProvider } from "@/lib/ai/providers/claude";
import { AIError } from "@/lib/ai/types";

function sse(events: object[]) {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function fakeClaude(json: unknown, stop = "end_turn") {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init!.body)), headers: new Headers(init!.headers) });
    const text = JSON.stringify(json);
    return sse([
      { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } },
      { type: "message_stop" },
    ]);
  };
  const client = new Anthropic({ apiKey: "test", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
  return { ai: new ClaudeProvider(client), calls };
}

describe("Claude provider", () => {
  it("reads a page with image, subject, handwriting profile and structured output", async () => {
    const { ai, calls } = fakeClaude({ text: "The [[mole|male]] is a unit", focus_quotes: ["mole"], suggested_title: "Moles", legibility: "messy" });
    const r = await ai.readNotesPage({
      image: { mediaType: "image/jpeg", base64: "AAAA" },
      subject: { className: "AP Chemistry", topicName: "Stoichiometry" },
      handwritingProfile: '- "male" → "mole"',
      hasFocusMarks: true,
      pageNumber: 2,
      pageCount: 3,
    });
    expect(r).toMatchObject({ text: "The [[mole|male]] is a unit", focusQuotes: ["mole"], suggestedTitle: "Moles", legibility: "messy" });

    const { body, headers } = calls[0];
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect((body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const content = (body.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    const prompt = content[1].text!;
    expect(prompt).toContain("Class: AP Chemistry");
    expect(prompt).toContain("Topic: Stoichiometry");
    expect(prompt).toContain('"male" → "mole"');
    expect(prompt).toContain("Page 2 of 3");
    expect(prompt).toContain("focus marks");
    expect((body.system as { cache_control: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("maps quiz output to 0-based pages", async () => {
    const { ai } = fakeClaude({
      title: "Moles",
      concepts: [{ kind: "definition", term: "Mole", detail: "6.02e23 particles", page: 1, quote: "a mole is" }],
      questions: [
        { type: "flashcard", data: { front: "Mole", back: "6.02e23" }, explanation: "x", difficulty: 5, concept_index: 0, source_page: 2, source_quote: "a mole is", is_focus: true },
      ],
    });
    const q = await ai.generateQuiz({ pages: [{ pageIndex: 0, text: "a mole is", focusQuotes: [] }], subject: {}, types: ["flashcard"], questionCount: 1 });
    expect(q.concepts[0].page).toBe(0);
    expect(q.questions[0]).toMatchObject({ sourcePage: 1, difficulty: 3, isFocus: true, conceptIndex: 0 });
  });

  it("turns a refusal into a friendly error", async () => {
    const { ai } = fakeClaude({ text: "" }, "refusal");
    await expect(ai.readNotesPage({ subject: {}, pageNumber: 1, pageCount: 1 })).rejects.toBeInstanceOf(AIError);
  });
});
