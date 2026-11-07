import type { PaymentRecord } from "@tollkeeper/shared";

/** What the planner (the agent's "brain") can ask for. */
export type Action =
  | { kind: "read"; source: string; why: string }
  | { kind: "pay"; recipient: string; amountNear: string; memo: string; why: string }
  | { kind: "finish"; summary: string };

/** What happened, in order. The dashboard and the demo both render this. */
export type AgentEvent =
  | { kind: "read"; source: string; why: string; content: string }
  | { kind: "payment"; why: string; record: PaymentRecord }
  | { kind: "error"; message: string }
  | { kind: "finished"; summary: string };

/** Decides the next step. Swap in an LLM-backed planner without touching the loop. */
export interface Planner {
  next(history: readonly AgentEvent[]): Promise<Action>;
}

/** The outside world the agent can read from. */
export interface World {
  read(source: string): Promise<string>;
}
