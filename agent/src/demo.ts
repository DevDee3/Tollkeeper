import { fileURLToPath } from "node:url";
import { MockTollkeeper, formatNear, parseNear } from "@tollkeeper/shared";
import { runAgent } from "./agent";
import { loadEnvFile } from "./env";
import { choosePlanner } from "./planner";
import { show } from "./print";
import { createDemoWorld, DEMO } from "./scenario";

loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));

const chain = new MockTollkeeper({
  owner: DEMO.owner,
  agent: DEMO.agent,
  dailyCap: parseNear("10"),
  autoLimit: parseNear("2"),
  balance: parseNear("100"),
});
const owner = chain.ownerClient();
for (const vendor of Object.values(DEMO.vendors)) await owner.addRecipient(vendor);

let chosen;
try {
  chosen = choosePlanner(process.argv.slice(2), process.env, DEMO.vendors);
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

console.log("Rules: 10 NEAR a day, anything over 2 NEAR needs your approval, allowlisted recipients only");
console.log(`Agent: ${chosen.label}\n`);
await runAgent({ client: chain.agentClient(), planner: chosen.planner, world: createDemoWorld(), onEvent: show });

const cfg = await owner.getConfig();
console.log(`\nSpent today ${formatNear(cfg.spent_today)} of ${formatNear(cfg.daily_cap)}.`);
console.log(`Waiting for you: ${(await owner.getPending()).length} payment(s).`);
