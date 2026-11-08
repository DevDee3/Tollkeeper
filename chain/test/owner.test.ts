import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSucceeded, createOwnerClient, failureMessage, walletSender, type WalletLike } from "../src";

type Call = { method: string; args: Record<string, unknown> };

function rec(id: number, status = "Paid") {
  return { id, recipient: "shop.testnet", amount: "1", memo: "", status, reason: "", timestamp_ms: 1 };
}

/** A log of `total` records, served newest first, with the same paging the contract uses. */
function fakeView(total: number) {
  const calls: Call[] = [];
  const view = async (method: string, args: Record<string, unknown>) => {
    calls.push({ method, args });
    if (method !== "get_log") return null;
    const from = (args.from_index as number | null) ?? 0;
    const limit = (args.limit as number | null) ?? 20;
    const ids = Array.from({ length: total }, (_, i) => total - 1 - i).slice(from, from + limit);
    return ids.map((id) => rec(id));
  };
  return { calls, view };
}

test("approve sends the right call and reads the updated record back by id", async () => {
  const sent: Call[] = [];
  const { view } = fakeView(5);
  const owner = createOwnerClient(view, async (method, args) => void sent.push({ method, args }));
  const record = await owner.approve(3);
  assert.deepEqual(sent, [{ method: "approve", args: { id: 3 } }]);
  assert.equal(record.id, 3);
});

test("reading a record back works for the oldest payment too", async () => {
  const { view } = fakeView(150);
  const owner = createOwnerClient(view, async () => undefined);
  assert.equal((await owner.reject(0)).id, 0);
});

test("a record that cannot be found is reported", async () => {
  const owner = createOwnerClient(async () => [], async () => undefined);
  await assert.rejects(owner.approve(1), /could not be read back/);
});

test("rule changes use the argument names the contract expects", async () => {
  const sent: Call[] = [];
  const owner = createOwnerClient(fakeView(0).view, async (method, args) => void sent.push({ method, args }));
  await owner.addRecipient("shop.testnet");
  await owner.removeRecipient("shop.testnet");
  await owner.setLimits(10_000_000_000_000_000_000_000_000n, 2_000_000_000_000_000_000_000_000n);
  await owner.setAgent("agent.testnet");
  assert.deepEqual(sent, [
    { method: "add_recipient", args: { account_id: "shop.testnet" } },
    { method: "remove_recipient", args: { account_id: "shop.testnet" } },
    { method: "set_limits", args: { daily_cap: "10000000000000000000000000", auto_limit: "2000000000000000000000000" } },
    { method: "set_agent", args: { agent: "agent.testnet" } },
  ]);
});

test("the wallet sender builds one function call with no deposit", async () => {
  let seen: unknown;
  const wallet: WalletLike = {
    async signAndSendTransaction(params) {
      seen = params;
      return { status: { SuccessValue: "" } };
    },
  };
  const send = walletSender(async () => wallet, "tollkeeper-policy.testnet", "tollkeeper.testnet");
  await send("approve", { id: 2 });
  assert.deepEqual(seen, {
    signerId: "tollkeeper.testnet",
    receiverId: "tollkeeper-policy.testnet",
    actions: [{ type: "FunctionCall", params: { methodName: "approve", args: { id: 2 }, gas: "50000000000000", deposit: "0" } }],
  });
});

test("a contract panic reaches the user as the contract's own message", async () => {
  const failed = {
    status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: Only the owner can do this" } } } } },
  };
  const wallet: WalletLike = { signAndSendTransaction: async () => failed };
  await assert.rejects(walletSender(async () => wallet, "p.testnet")("approve", { id: 1 }), /^Error: Only the owner can do this$/);
});

test("failure messages: unknown failures are generic, successes pass through", () => {
  assert.equal(failureMessage({ status: { Failure: { something: "else" } } }), "The transaction failed on the chain.");
  assert.equal(failureMessage({ status: { SuccessValue: "" } }), null);
  assert.equal(failureMessage(undefined), null);
  const ok = { status: { SuccessValue: "" } };
  assert.equal(assertSucceeded(ok), ok);
});
