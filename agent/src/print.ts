import { formatNear } from "@tollkeeper/shared";
import type { AgentEvent } from "./types";

const LABEL = { Paid: "PAID    ", Pending: "WAITING ", Blocked: "BLOCKED ", Rejected: "DECLINED" } as const;

/** One readable line (or two) per thing the agent does. Used by both the offline and live runs. */
export function show(event: AgentEvent): void {
  switch (event.kind) {
    case "read":
      console.log(`  read      ${event.source}`);
      break;
    case "payment": {
      const r = event.record;
      console.log(`  ${LABEL[r.status]}  ${formatNear(r.amount).padEnd(9)} -> ${r.recipient}`);
      console.log(`            ${r.reason}`);
      break;
    }
    case "error":
      console.log(`  error     ${event.message}`);
      break;
    case "finished":
      console.log(`  done      ${event.summary}`);
  }
}
