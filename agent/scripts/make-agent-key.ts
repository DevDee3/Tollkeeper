/**
 * Creates the agent's restricted key and saves it to agent/.env.
 * Run it once: `npm run make-agent-key`. It never prints the private key.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KeyPair, type KeyPairString } from "near-api-js";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
const POLICY = "tollkeeper-policy.testnet";
const AGENT = "tollkeeper-agent.testnet";

let keyPair: KeyPair;
const existing = existsSync(envPath) ? /^AGENT_KEY=(.+)$/m.exec(readFileSync(envPath, "utf8")) : null;

if (existing?.[1]) {
  keyPair = KeyPair.fromString(existing[1].trim() as KeyPairString);
  console.log("agent/.env already has an agent key, so I left it alone.\n");
} else {
  keyPair = KeyPair.fromRandom("ed25519");
  const lines = [
    "# Created by `npm run make-agent-key`. Never commit or share this file.",
    `POLICY_ACCOUNT=${POLICY}`,
    `AGENT_ACCOUNT=${AGENT}`,
    `AGENT_KEY=${keyPair.toString()}`,
    "",
  ];
  writeFileSync(envPath, lines.join("\n"), { mode: 0o600 });
  console.log("Saved a new agent key to agent/.env (the private key is in that file only).\n");
}

const publicKey = keyPair.getPublicKey().toString();
const agentAccount = /^AGENT_ACCOUNT=(.+)$/m.exec(readFileSync(envPath, "utf8"))?.[1]?.trim() ?? AGENT;
const policyAccount = /^POLICY_ACCOUNT=(.+)$/m.exec(readFileSync(envPath, "utf8"))?.[1]?.trim() ?? POLICY;

console.log("Public key (safe to share):");
console.log(`  ${publicKey}\n`);
console.log("Next, tell the chain what this key is allowed to do. Run:\n");
console.log(`  near account add-key ${agentAccount}\n`);
console.log("and answer the prompts like this:");
console.log("  permissions       grant-function-call-access");
console.log(`  receiver account  ${policyAccount}`);
console.log("  method names      request_payment");
console.log("  allowance         1 NEAR   (the gas this key may spend)");
console.log("  public key        paste the public key above (manually provided)");
console.log(`  sign as           ${agentAccount}, with your keychain`);
