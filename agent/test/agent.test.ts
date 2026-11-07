import { test } from "node:test";
import assert from "node:assert/strict";
import { MockTollkeeper, parseNear } from "@tollkeeper/shared";
import { runAgent } from "../src/agent";
import { createDemoWorld, DEMO, NaivePlanner } from "../src/scenario";
import type { Action, Planner } from "../src/types";

async function demoChain() {
  const chain = new MockTollkeeper({
    owner: DEMO.owner,
    agent: DEMO.agent,
    dailyCap: parseNear("10"),
    autoLimit: parseNear("2"),
    balance: parseNear("100"),
  });
  for (const v of Object.values(DEMO.vendors)) await chain.ownerClient().addRecipient(v);
  return chain;
}

test("the injected payment is blocked and the legitimate ones still go through", async () => {
  const chain = await demoChain();
  const events = await runAgent({
    client: chain.agentClient(),
    planner: new NaivePlanner(),
    world: createDemoWorld(),
  });

  const payments = events.flatMap((e) => (e.kind === "payment" ? [e.record] : []));
  assert.deepEqual(
    payments.map((p) => [p.recipient, p.status]),
    [
      [DEMO.vendors.dataApi, "Paid"],
      [DEMO.attacker, "Blocked"],
      [DEMO.vendors.summarizer, "Paid"],
      [DEMO.vendors.premium, "Pending"],
    ],
  );
  assert.equal(payments[1]?.reason, "Recipient is not on the allowlist");
  assert.equal(events.at(-1)?.kind, "finished");
});

test("no funds reach the attacker and only paid amounts count against the cap", async () => {
  const chain = await demoChain();
  await runAgent({ client: chain.agentClient(), planner: new NaivePlanner(), world: createDemoWorld() });
  assert.equal(chain.treasuryBalance(), parseNear("100") - parseNear("2.5"));
  assert.equal((await chain.agentClient().getConfig()).spent_today, parseNear("2.5").toString());
});

test("the owner can approve the waiting payment afterwards", async () => {
  const chain = await demoChain();
  await runAgent({ client: chain.agentClient(), planner: new NaivePlanner(), world: createDemoWorld() });
  const owner = chain.ownerClient();
  const [pending] = await owner.getPending();
  assert.ok(pending);
  assert.equal((await owner.approve(pending.id)).status, "Paid");
});

test("a planner that never finishes is stopped at the step limit", async () => {
  const chain = await demoChain();
  const looping: Planner = {
    async next(): Promise<Action> {
      return { kind: "read", source: "news:near-ecosystem", why: "again" };
    },
  };
  const events = await runAgent({ client: chain.agentClient(), planner: looping, world: createDemoWorld(), maxSteps: 3 });
  assert.equal(events.filter((e) => e.kind === "read").length, 3);
  const last = events.at(-1);
  assert.ok(last?.kind === "finished");
  assert.equal(last.summary, "Stopped after 3 steps.");
});

test("a bad request becomes an error event instead of crashing the run", async () => {
  const chain = await demoChain();
  const actions: Action[] = [
    { kind: "pay", recipient: DEMO.vendors.dataApi, amountNear: "0", memo: "x", why: "oops" },
    { kind: "finish", summary: "ok" },
  ];
  const planner: Planner = {
    async next() {
      return actions.shift() ?? { kind: "finish", summary: "empty" };
    },
  };
  const events = await runAgent({ client: chain.agentClient(), planner, world: createDemoWorld() });
  const first = events[0];
  assert.ok(first?.kind === "error");
  assert.match(first.message, /Amount must be greater than zero/);
  assert.equal(events.at(-1)?.kind, "finished");
});
