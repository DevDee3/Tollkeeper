/**
 * Runs the agent story against the real contract on testnet.
 * Setup is in docs/live-setup.md. Run with: npm run demo:live
 */
import { fileURLToPath } from "node:url";
import { connectAgent, loadLiveConfig } from "@tollkeeper/chain";
import { formatNear } from "@tollkeeper/shared";
import { runAgent } from "./agent";
import { loadEnvFile } from "./env";
import { show } from "./print";
import { choosePlanner } from "./planner";
import { createDemoWorld, type Vendors } from "./scenario";

loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));

const vendors: Vendors = {
  dataApi: process.env.VENDOR_DATA?.trim() || "tollkeeper-data.testnet",
  summarizer: process.env.VENDOR_SUMMARIZER?.trim() || "tollkeeper-writer.testnet",
  premium: process.env.VENDOR_PREMIUM?.trim() || "tollkeeper-premium.testnet",
};

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

let cfg;
try {
  cfg = loadLiveConfig(process.env);
} catch (err) {
  fail(`Setup is not finished:\n${err instanceof Error ? err.message : String(err)}`);
}

const client = connectAgent(cfg);

try {
  const rules = await client.getConfig();
  console.log(`Contract ${cfg.policyAccount}, acting as ${cfg.agentAccount}`);
  console.log(`Rules: ${formatNear(rules.daily_cap)} a day, anything over ${formatNear(rules.auto_limit)} needs your approval`);
  console.log(`Spent today so far: ${formatNear(rules.spent_today)}\n`);

  const missing: string[] = [];
  for (const account of Object.values(vendors)) if (!(await client.isAllowed(account))) missing.push(account);
  if (missing.length > 0) {
    const cmds = missing.map(
      (a) =>
        `  near contract call-function as-transaction ${cfg.policyAccount} add_recipient json-args "{\\"account_id\\":\\"${a}\\"}" prepaid-gas "30.0 Tgas" attached-deposit "0 NEAR" sign-as ${rules.owner} network-config testnet sign-with-keychain send`,
    );
    fail(`These vendors are not on your allowlist yet, so every payment to them would be stopped:\n${missing.map((a) => `  ${a}`).join("\n")}\n\nAdd them as the owner (${rules.owner}):\n${cmds.join("\n")}`);
  }
} catch (err) {
  fail(
    `Could not read the contract. Check POLICY_ACCOUNT and your internet connection (RPC: ${cfg.rpcUrl}).\n${err instanceof Error ? err.message : String(err)}`,
  );
}

let chosen;
try {
  chosen = choosePlanner(process.argv.slice(2), process.env, vendors);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
console.log(`Agent: ${chosen.label}\n`);

await runAgent({ client, planner: chosen.planner, world: createDemoWorld(), onEvent: show });

const after = await client.getConfig();
const pending = await client.getPending();
console.log(`\nSpent today ${formatNear(after.spent_today)} of ${formatNear(after.daily_cap)}.`);
if (pending.length > 0) {
  console.log(`Waiting for you: ${pending.length} payment(s). Approve or decline them as ${after.owner}.`);
}
