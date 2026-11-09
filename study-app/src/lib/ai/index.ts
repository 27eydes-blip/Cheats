import "server-only";
import { ClaudeProvider } from "./providers/claude";
import { MockProvider } from "./providers/mock";
import type { AIProvider } from "./types";

/**
 * The single entry point for AI. Route handlers call getAI() and never import
 * a provider directly.
 *
 * AI_PROVIDER=claude (default when ANTHROPIC_API_KEY is set) or mock
 * (offline, for development and tests). To add another provider, implement
 * AIProvider in ./providers and add a case here.
 */
let cached: AIProvider | null = null;

export function getAI(): AIProvider {
  if (cached) return cached;
  const choice = process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "claude" : "mock");
  switch (choice) {
    case "claude":
      cached = new ClaudeProvider();
      break;
    case "mock":
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_AI !== "true") {
        throw new Error("AI_PROVIDER=mock is disabled in production. Set ANTHROPIC_API_KEY.");
      }
      cached = new MockProvider();
      break;
    default:
      throw new Error(`Unknown AI_PROVIDER "${choice}"`);
  }
  return cached;
}

export * from "./types";
