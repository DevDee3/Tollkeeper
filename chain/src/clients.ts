import type { AgentClient, Config, PaymentRecord, ViewApi } from "@tollkeeper/shared";

/** A read-only contract call. Anyone can make these. */
export type ViewCall = (method: string, args: Record<string, unknown>) => Promise<unknown>;
/** A signed call that changes state. */
export type SendCall = (method: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Wraps contract views in the same interface the demo uses, so the dashboard
 * and the agent don't care whether they talk to the mock or to the chain.
 * Argument names match contracts/policy/src/lib.rs.
 */
export function createViews(view: ViewCall): ViewApi {
  return {
    getConfig: async () => (await view("get_config", {})) as Config,
    getAllowlist: async () => (await view("get_allowlist", {})) as string[],
    isAllowed: async (accountId) => (await view("is_allowed", { account_id: accountId })) as boolean,
    getLog: async (fromIndex, limit) =>
      (await view("get_log", { from_index: fromIndex ?? null, limit: limit ?? null })) as PaymentRecord[],
    getPending: async () => (await view("get_pending", {})) as PaymentRecord[],
  };
}

/** The agent's whole power: read the rules, and ask for a payment. */
export function createAgentClient(view: ViewCall, send: SendCall): AgentClient {
  return {
    ...createViews(view),
    requestPayment: async (recipient, amountYocto, memo) => {
      const result = await send("request_payment", { recipient, amount: amountYocto.toString(), memo });
      if (!result || typeof result !== "object") {
        throw new Error("The contract answered without a payment record. Check the transaction on a NEAR explorer.");
      }
      return result as PaymentRecord;
    },
  };
}
