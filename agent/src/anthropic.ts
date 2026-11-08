import type { Completion } from "./llm";

export const DEFAULT_MODEL = "claude-haiku-5-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Calls the Anthropic Messages API and forces the model to choose one tool. */
export function anthropicCompletion(opts: AnthropicOptions): Completion {
  const { apiKey, model = DEFAULT_MODEL, fetchImpl = fetch } = opts;
  return async ({ system, user, tools }) => {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        tools,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: user }],
      }),
    });

    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    } | null;

    if (!response.ok) {
      const reason = body?.error?.message ?? response.statusText;
      throw new Error(`The model service returned ${response.status}: ${reason}`);
    }
    const call = body?.content?.find((block) => block.type === "tool_use");
    if (!call?.name) throw new Error("The model did not choose an action.");
    return { name: call.name, input: call.input ?? {} };
  };
}
