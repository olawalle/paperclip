import * as p from "@clack/prompts";
import type { LlmConfig } from "../config/schema.js";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export async function promptLlm(): Promise<LlmConfig | undefined> {
  const configureLlm = await p.confirm({
    message: "Configure an LLM provider now?",
    initialValue: false,
  });

  if (p.isCancel(configureLlm)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (!configureLlm) return undefined;

  const provider = await p.select({
    message: "LLM provider",
    options: [
      { value: "claude" as const, label: "Claude (Anthropic)" },
      { value: "openai" as const, label: "OpenAI" },
      { value: "openrouter" as const, label: "OpenRouter" },
    ],
  });

  if (p.isCancel(provider)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const apiKeyLabel =
    provider === "claude" ? "Anthropic" : provider === "openrouter" ? "OpenRouter" : "OpenAI";

  const apiKey = await p.password({
    message: `${apiKeyLabel} API key`,
    validate: (val) => {
      if (!val) return "API key is required";
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  return { provider, apiKey };
}
