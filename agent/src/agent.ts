import { parseNear, type AgentClient } from "@tollkeeper/shared";
import type { AgentEvent, Planner, World } from "./types";

export interface RunOptions {
  /** The agent's restricted client. It can request payments and nothing else. */
  client: AgentClient;
  planner: Planner;
  world: World;
  /** Safety stop so a confused planner cannot loop forever. */
  maxSteps?: number;
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Runs the agent until it finishes or hits the step limit. Every payment goes
 * through the policy contract; the loop itself holds no spending authority, so
 * a manipulated planner can ask for anything but is only paid what the policy allows.
 */
export async function runAgent(opts: RunOptions): Promise<AgentEvent[]> {
  const { client, planner, world, maxSteps = 20, onEvent } = opts;
  const history: AgentEvent[] = [];
  const emit = (event: AgentEvent) => {
    history.push(event);
    onEvent?.(event);
  };

  for (let step = 0; step < maxSteps; step++) {
    let action;
    try {
      action = await planner.next(history);
    } catch (err) {
      // A planner that cannot decide (for example, the model is unreachable) ends the run cleanly.
      emit({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      emit({ kind: "finished", summary: "Stopped because the planner could not decide the next step." });
      return history;
    }

    try {
      if (action.kind === "finish") {
        emit({ kind: "finished", summary: action.summary });
        return history;
      }
      if (action.kind === "read") {
        const content = await world.read(action.source);
        emit({ kind: "read", source: action.source, why: action.why, content });
      } else {
        const record = await client.requestPayment(action.recipient, parseNear(action.amountNear), action.memo);
        emit({ kind: "payment", why: action.why, record });
      }
    } catch (err) {
      emit({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  emit({ kind: "finished", summary: `Stopped after ${maxSteps} steps.` });
  return history;
}
