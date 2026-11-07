import { MockTollkeeper, formatNear, parseNear } from "@tollkeeper/shared";
import { runAgent } from "./agent";
import { createDemoWorld, DEMO, NaivePlanner } from "./scenario";
import type { AgentEvent } from "./types";

const ICON = { Paid: "PAID   ", Pending: "WAITING", Blocked: "BLOCKED", Rejected: "DECLINED" } as const;

function show(event: AgentEvent): void {
  switch (event.kind) {
    case "read":
      console.log(`  read     ${event.source}`);
      break;
    case "payment": {
      const r = event.record;
      console.log(`  ${ICON[r.status]}  ${formatNear(r.amount).padEnd(9)} -> ${r.recipient}`);
      console.log(`           ${r.reason}`);
      break;
    }
    case "error":
      console.log(`  error    ${event.message}`);
      break;
    case "finished":
      console.log(`  done     ${event.summary}`);
  }
}

const chain = new MockTollkeeper({
  owner: DEMO.owner,
  agent: DEMO.agent,
  dailyCap: parseNear("10"),
  autoLimit: parseNear("2"),
  balance: parseNear("100"),
});
const owner = chain.ownerClient();
for (const vendor of Object.values(DEMO.vendors)) await owner.addRecipient(vendor);

console.log("Rules: 10 NEAR a day, anything over 2 NEAR needs your approval, allowlisted recipients only\n");
await runAgent({ client: chain.agentClient(), planner: new NaivePlanner(), world: createDemoWorld(), onEvent: show });

const cfg = await owner.getConfig();
console.log(`\nSpent today ${formatNear(cfg.spent_today)} of ${formatNear(cfg.daily_cap)}.`);
console.log(`Waiting for you: ${(await owner.getPending()).length} payment(s).`);
