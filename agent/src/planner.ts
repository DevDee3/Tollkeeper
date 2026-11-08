import { anthropicCompletion, DEFAULT_MODEL } from "./anthropic";
import { LlmPlanner } from "./llm";
import { NaivePlanner, type Vendors } from "./scenario";
import type { Planner } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Picks who decides the agent's next step. The scripted planner is the default, so the
 * demo works offline and plays out the same way every time. `--llm` uses a real model.
 */
export function choosePlanner(args: readonly string[], env: Env, vendors: Vendors): { planner: Planner; label: string } {
  if (!args.includes("--llm")) {
    return { planner: new NaivePlanner(vendors), label: "scripted agent (same story every time)" };
  }
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("--llm needs a model key. Add ANTHROPIC_API_KEY=... to agent/.env (see agent/.env.example).");
  }
  const model = env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return { planner: new LlmPlanner(anthropicCompletion({ apiKey, model }), vendors), label: `model-driven agent (${model})` };
}
