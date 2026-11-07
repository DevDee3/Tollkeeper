// Test names mirror contracts/policy/src/lib.rs so the mock can't drift from the contract unnoticed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockTollkeeper, formatNear, parseNear } from "../src";

const NEAR = 10n ** 24n;
const DAY = 86_400_000;
const OWNER = "owner.testnet";
const AGENT = "agent.testnet";
const VENDOR = "vendor.testnet";
const STRANGER = "stranger.testnet";

function setup(startMs = 0) {
  let now = startMs;
  const chain = new MockTollkeeper({
    owner: OWNER,
    agent: AGENT,
    dailyCap: 10n * NEAR,
    autoLimit: 2n * NEAR,
    balance: 100n * NEAR,
    now: () => now,
  });
  const agent = chain.agentClient();
  const owner = chain.ownerClient();
  return { chain, agent, owner, setNow: (ms: number) => (now = ms) };
}

async function ready() {
  const s = setup();
  await s.owner.addRecipient(VENDOR);
  return s;
}

test("pays_within_limits", async () => {
  const { agent, chain } = await ready();
  const r = await agent.requestPayment(VENDOR, NEAR, "x");
  assert.equal(r.status, "Paid");
  assert.equal((await agent.getConfig()).spent_today, NEAR.toString());
  assert.equal(chain.treasuryBalance(), 99n * NEAR);
});

test("blocks_unknown_recipient_and_keeps_the_record", async () => {
  const { agent } = await ready();
  const r = await agent.requestPayment(STRANGER, NEAR, "x");
  assert.equal(r.status, "Blocked");
  assert.equal(r.reason, "Recipient is not on the allowlist");
  assert.equal((await agent.getConfig()).spent_today, "0");
  assert.equal((await agent.getLog()).length, 1);
});

test("blocks_when_daily_cap_would_be_exceeded", async () => {
  const { agent } = await ready();
  for (let i = 0; i < 5; i++) assert.equal((await agent.requestPayment(VENDOR, 2n * NEAR, "x")).status, "Paid");
  const r = await agent.requestPayment(VENDOR, NEAR, "x");
  assert.equal(r.status, "Blocked");
  assert.equal(r.reason, "Would exceed the daily spending cap");
});

test("daily_cap_resets_the_next_day", async () => {
  const { agent, setNow } = await ready();
  for (let i = 0; i < 5; i++) await agent.requestPayment(VENDOR, 2n * NEAR, "x");
  assert.equal((await agent.requestPayment(VENDOR, NEAR, "x")).status, "Blocked");
  setNow(DAY);
  assert.equal((await agent.requestPayment(VENDOR, NEAR, "x")).status, "Paid");
  assert.equal((await agent.getConfig()).spent_today, NEAR.toString());
});

test("large_payment_waits_then_owner_approves", async () => {
  const { agent, owner } = await ready();
  const r = await agent.requestPayment(VENDOR, 5n * NEAR, "x");
  assert.equal(r.status, "Pending");
  assert.equal(r.reason, "Above what the agent can pay on its own. Waiting for your approval");
  assert.equal((await agent.getConfig()).spent_today, "0");
  assert.equal((await agent.getPending()).length, 1);
  const approved = await owner.approve(r.id);
  assert.equal(approved.status, "Paid");
  assert.equal((await agent.getConfig()).spent_today, (5n * NEAR).toString());
  assert.equal((await agent.getPending()).length, 0);
});

test("owner_can_reject_a_pending_payment", async () => {
  const { agent, owner } = await ready();
  const r = await agent.requestPayment(VENDOR, 5n * NEAR, "x");
  assert.equal((await owner.reject(r.id)).status, "Rejected");
  assert.equal((await agent.getConfig()).spent_today, "0");
});

test("approval_rechecks_the_allowlist", async () => {
  const { agent, owner } = await ready();
  const r = await agent.requestPayment(VENDOR, 5n * NEAR, "x");
  await owner.removeRecipient(VENDOR);
  await assert.rejects(owner.approve(r.id), /Recipient is no longer on the allowlist/);
});

test("approval_rechecks_the_daily_cap", async () => {
  const { agent, owner } = await ready();
  const r = await agent.requestPayment(VENDOR, 5n * NEAR, "x");
  for (let i = 0; i < 3; i++) await agent.requestPayment(VENDOR, 2n * NEAR, "x");
  await assert.rejects(owner.approve(r.id), /Approving this would exceed the daily cap/);
});

test("blocks_when_treasury_is_too_low", async () => {
  const chain = new MockTollkeeper({
    owner: OWNER,
    agent: AGENT,
    dailyCap: 10n * NEAR,
    autoLimit: 2n * NEAR,
    balance: (12n * NEAR) / 10n, // 1.2 NEAR, minus the 0.5 reserve leaves 0.7
  });
  await chain.ownerClient().addRecipient(VENDOR);
  const r = await chain.agentClient().requestPayment(VENDOR, NEAR, "x");
  assert.equal(r.status, "Blocked");
  assert.equal(r.reason, "Not enough funds in the treasury");
});

test("rejects_zero_amount", async () => {
  const { agent } = await ready();
  await assert.rejects(agent.requestPayment(VENDOR, 0n, "x"), /Amount must be greater than zero/);
});

test("limits_must_be_consistent", async () => {
  const { owner } = await ready();
  await assert.rejects(owner.setLimits(NEAR, 2n * NEAR), /Auto-approve limit cannot exceed the daily cap/);
});

test("owner_can_change_limits", async () => {
  const { agent, owner } = await ready();
  await owner.setLimits(20n * NEAR, 5n * NEAR);
  const cfg = await agent.getConfig();
  assert.equal(cfg.daily_cap, (20n * NEAR).toString());
  assert.equal((await agent.requestPayment(VENDOR, 5n * NEAR, "x")).status, "Paid");
});

test("allowlist_views_follow_the_owner_s_changes", async () => {
  const { agent, owner } = await ready();
  assert.equal(await agent.isAllowed(VENDOR), true);
  assert.equal(await agent.isAllowed(STRANGER), false);
  assert.deepEqual(await agent.getAllowlist(), [VENDOR]);
  await owner.removeRecipient(VENDOR);
  assert.deepEqual(await agent.getAllowlist(), []);
  assert.equal((await agent.requestPayment(VENDOR, NEAR, "x")).status, "Blocked");
});

test("config_shows_zero_spent_once_a_new_day_starts", async () => {
  const { agent, setNow } = await ready();
  await agent.requestPayment(VENDOR, 2n * NEAR, "x");
  setNow(DAY);
  const cfg = await agent.getConfig();
  assert.equal(cfg.spent_today, "0");
  assert.equal(cfg.remaining_today, (10n * NEAR).toString());
});

test("log_is_newest_first_and_paged", async () => {
  const { agent } = await ready();
  for (let i = 0; i < 3; i++) await agent.requestPayment(VENDOR, NEAR, "x");
  const page = await agent.getLog(0, 2);
  assert.deepEqual(page.map((r) => r.id), [2, 1]);
  assert.equal((await agent.getLog(2, 2))[0]?.id, 0);
});

test("swapping_the_agent_updates_the_config", async () => {
  const { agent, owner } = await ready();
  await owner.setAgent("new-agent.testnet");
  assert.equal((await agent.getConfig()).agent, "new-agent.testnet");
});

test("agent_client_has_no_owner_powers", async () => {
  const { agent } = await ready();
  for (const name of ["approve", "reject", "addRecipient", "removeRecipient", "setLimits", "setAgent"]) {
    assert.equal(name in agent, false, `agent client must not expose ${name}`);
  }
});

test("near_amounts_round_trip", () => {
  assert.equal(parseNear("1.5"), 15n * NEAR / 10n);
  assert.equal(parseNear("0.000001"), NEAR / 1_000_000n);
  assert.equal(formatNear(parseNear("2.25")), "2.25 NEAR");
  assert.equal(formatNear(3n * NEAR), "3 NEAR");
  assert.throws(() => parseNear("1,5"), /Not a valid NEAR amount/);
});
