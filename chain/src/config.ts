export const DEFAULT_RPC_URL = "https://test.rpc.fastnear.com";

export interface LiveConfig {
  rpcUrl: string;
  /** The deployed policy contract, e.g. tollkeeper-policy.testnet. */
  policyAccount: string;
  /** The account the agent acts as, e.g. tollkeeper-agent.testnet. */
  agentAccount: string;
  /** The agent's restricted key. It can only call request_payment on the policy contract. */
  agentKey: string;
}

type Env = Record<string, string | undefined>;

const ACCOUNT = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,}$/;

/**
 * Reads the live settings from environment variables. Problems are collected
 * and reported together, in words that say what to do, so one run fixes them all.
 */
export function loadLiveConfig(env: Env): LiveConfig {
  const problems: string[] = [];
  const need = (name: string, hint: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is missing. ${hint}`);
    return value ?? "";
  };

  const policyAccount = need("POLICY_ACCOUNT", "Set it to your deployed contract, like tollkeeper-policy.testnet.");
  const agentAccount = need("AGENT_ACCOUNT", "Set it to the agent's account, like tollkeeper-agent.testnet.");
  const agentKey = need("AGENT_KEY", "Run `npm run make-agent-key` to create one.");

  if (policyAccount && !ACCOUNT.test(policyAccount)) problems.push(`POLICY_ACCOUNT "${policyAccount}" is not a valid NEAR account name.`);
  if (agentAccount && !ACCOUNT.test(agentAccount)) problems.push(`AGENT_ACCOUNT "${agentAccount}" is not a valid NEAR account name.`);
  if (agentKey && !KEY.test(agentKey)) problems.push("AGENT_KEY must look like ed25519:... Run `npm run make-agent-key` to create a fresh one.");

  if (problems.length > 0) throw new Error(problems.join("\n"));

  return { rpcUrl: env.NEAR_RPC_URL?.trim() || DEFAULT_RPC_URL, policyAccount, agentAccount, agentKey };
}
