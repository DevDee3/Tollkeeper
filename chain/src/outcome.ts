type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;

function dig(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * If a transaction's outcome says it failed, returns the reason in plain words,
 * otherwise null. Contract panics (like "Only the owner can do this") come back
 * as the contract's own message, without NEAR's "Smart contract panicked:" prefix.
 */
export function failureMessage(outcome: unknown): string | null {
  const failure = dig(outcome, ["status", "Failure"]);
  if (failure === undefined) return null;
  const reason = dig(failure, ["ActionError", "kind", "FunctionCallError", "ExecutionError"]);
  if (typeof reason === "string") return reason.replace(/^Smart contract panicked:\s*/, "");
  return "The transaction failed on the chain.";
}

/** Passes a successful outcome through and throws the plain-language reason for a failed one. */
export function assertSucceeded<T>(outcome: T): T {
  const message = failureMessage(outcome);
  if (message) throw new Error(message);
  return outcome;
}
