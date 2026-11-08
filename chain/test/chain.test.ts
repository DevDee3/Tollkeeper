import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentClient, createViews, loadLiveConfig, DEFAULT_RPC_URL } from "../src";

const KEY = "ed25519:" + "5".repeat(60);
const GOOD_ENV = { POLICY_ACCOUNT: "tollkeeper-policy.testnet", AGENT_ACCOUNT: "tollkeeper-agent.testnet", AGENT_KEY: KEY };

type Call = { method: string; args: Record<string, unknown> };

function recorder(reply: unknown) {
  const calls: Call[] = [];
  const fn = async (method: string, args: Record<string, unknown>) => {
    calls.push({ method, args });
    return reply;
  };
  return { calls, fn };
}

test("views call the contract methods with the argument names the contract expects", async () => {
  const { calls, fn } = recorder([]);
  const views = createViews(fn);
  await views.getConfig();
  await views.getAllowlist();
  await views.isAllowed("shop.testnet");
  await views.getLog(5, 10);
  await views.getLog();
  await views.getPending();
  assert.deepEqual(calls, [
    { method: "get_config", args: {} },
    { method: "get_allowlist", args: {} },
    { method: "is_allowed", args: { account_id: "shop.testnet" } },
    { method: "get_log", args: { from_index: 5, limit: 10 } },
    { method: "get_log", args: { from_index: null, limit: null } },
    { method: "get_pending", args: {} },
  ]);
});

test("a payment request sends the amount as a decimal string, as the contract's U128 expects", async () => {
  const record = { id: 0, recipient: "shop.testnet", amount: "1500000000000000000000000", memo: "x", status: "Paid", reason: "Within all limits", timestamp_ms: 1 };
  const view = recorder(null);
  const send = recorder(record);
  const client = createAgentClient(view.fn, send.fn);

  const result = await client.requestPayment("shop.testnet", 1_500_000_000_000_000_000_000_000n, "x");

  assert.deepEqual(send.calls, [
    { method: "request_payment", args: { recipient: "shop.testnet", amount: "1500000000000000000000000", memo: "x" } },
  ]);
  assert.equal(result.status, "Paid");
  assert.equal(view.calls.length, 0);
});

test("an empty answer from the chain is reported instead of passed along", async () => {
  const client = createAgentClient(recorder(null).fn, recorder(undefined).fn);
  await assert.rejects(client.requestPayment("shop.testnet", 1n, "x"), /without a payment record/);
});

test("the agent client exposes no owner powers", () => {
  const client = createAgentClient(recorder(null).fn, recorder(null).fn);
  for (const name of ["approve", "reject", "addRecipient", "removeRecipient", "setLimits", "setAgent"]) {
    assert.equal(name in client, false, `must not expose ${name}`);
  }
});

test("config loads with the default RPC", () => {
  const cfg = loadLiveConfig(GOOD_ENV);
  assert.equal(cfg.rpcUrl, DEFAULT_RPC_URL);
  assert.equal(cfg.policyAccount, "tollkeeper-policy.testnet");
});

test("config uses a custom RPC when one is set", () => {
  assert.equal(loadLiveConfig({ ...GOOD_ENV, NEAR_RPC_URL: "https://example.org/rpc" }).rpcUrl, "https://example.org/rpc");
});

test("config reports every problem at once, with what to do", () => {
  assert.throws(
    () => loadLiveConfig({ AGENT_ACCOUNT: "Bad Name", AGENT_KEY: "nope" }),
    (err: Error) =>
      /POLICY_ACCOUNT is missing/.test(err.message) &&
      /AGENT_ACCOUNT "Bad Name" is not a valid/.test(err.message) &&
      /AGENT_KEY must look like ed25519/.test(err.message),
  );
});

test("a missing key points at the key script", () => {
  assert.throws(() => loadLiveConfig({ ...GOOD_ENV, AGENT_KEY: "" }), /npm run make-agent-key/);
});
