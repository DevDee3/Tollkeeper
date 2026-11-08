import { Account, JsonRpcProvider, teraToGas, type KeyPairString } from "near-api-js";
import type { AgentClient, ViewApi } from "@tollkeeper/shared";
import { createAgentClient, createViews, type SendCall, type ViewCall } from "./clients";
import type { LiveConfig } from "./config";

/** Gas attached to each payment request. Plenty for a transfer plus the log write. */
const REQUEST_GAS_TGAS = "50";

/**
 * Reads give up after a couple of quick retries (the default is many slow ones), so a
 * dashboard that is offline says so within seconds instead of sitting on "Loading".
 */
const READ_OPTIONS = { retries: 2, wait: 400, backoff: 1.5 };

/** A read-only call function for the live contract. No key needed. */
export function connectView(rpcUrl: string, policyAccount: string): ViewCall {
  return viewCall(new JsonRpcProvider({ url: rpcUrl }, READ_OPTIONS), policyAccount);
}

/** Read-only access to the live contract's views. */
export function connectViews(rpcUrl: string, policyAccount: string): ViewApi {
  return createViews(connectView(rpcUrl, policyAccount));
}

/** The contract account's balance in yoctoNEAR, which is the treasury the agent spends from. */
export function connectTreasury(rpcUrl: string, policyAccount: string): () => Promise<bigint> {
  const provider = new JsonRpcProvider({ url: rpcUrl }, READ_OPTIONS);
  return async () => (await provider.viewAccount({ accountId: policyAccount })).amount;
}

/**
 * The agent's connection to the live contract. It signs with the restricted
 * key, which the chain itself limits to calling request_payment on this contract.
 */
export function connectAgent(cfg: LiveConfig): AgentClient {
  const provider = new JsonRpcProvider({ url: cfg.rpcUrl });
  const account = new Account(cfg.agentAccount, provider, cfg.agentKey as KeyPairString);
  const send: SendCall = (methodName, args) =>
    account.callFunction({
      contractId: cfg.policyAccount,
      methodName,
      args,
      gas: teraToGas(REQUEST_GAS_TGAS),
    });
  return createAgentClient(viewCall(provider, cfg.policyAccount), send);
}

function viewCall(provider: JsonRpcProvider, contractId: string): ViewCall {
  return (method, args) => provider.callFunction({ contractId, method, args });
}
