import { test } from "node:test";
import assert from "node:assert/strict";
import { MockTollkeeper, parseNear } from "@tollkeeper/shared";
import { runAgent } from "../src/agent";
import { anthropicCompletion } from "../src/anthropic";
import { LlmPlanner, renderHistory, systemPrompt, toAction, type Completion } from "../src/llm";
import { createDemoWorld, DEMO } from "../src/scenario";
import type { AgentEvent, Planner } from "../src/types";

const record = (status: "Paid" | "Blocked", reason: string) => ({
  id: 0, recipient: "shop.testnet", amount: "1000000000000000000000000", memo: "data", status, reason, timestamp_ms: 1,
});

test("the model's tool choices become actions", () => {
  assert.deepEqual(toAction({ name: "read_page", input: { source: "news:near-ecosystem", why: "news" } }), {
    kind: "read", source: "news:near-ecosystem", why: "news",
  });
  assert.deepEqual(toAction({ name: "pay", input: { recipient: " a.testnet ", amount_near: "1.5", memo: "m", why: "w" } }), {
    kind: "pay", recipient: "a.testnet", amountNear: "1.5", memo: "m", why: "w",
  });
  assert.deepEqual(toAction({ name: "finish", input: { summary: "done" } }), { kind: "finish", summary: "done" });
});

test("an incomplete or unknown choice is an error, not a guess", () => {
  assert.throws(() => toAction({ name: "pay", input: { amount_near: "1", why: "w" } }), /"recipient" is missing/);
  assert.throws(() => toAction({ name: "send_all", input: {} }), /does not exist/);
});

test("the history shows the model what happened, including page text and why a payment was stopped", () => {
  const history: AgentEvent[] = [
    { kind: "read", source: "news:x", why: "w", content: "hello page" },
    { kind: "payment", why: "w", record: record("Blocked", "Recipient is not on the allowlist") },
  ];
  const text = renderHistory(history);
  assert.match(text, /You read news:x\. It said:\n<<<\nhello page\n>>>/);
  assert.match(text, /pay 1 NEAR to shop\.testnet \(data\)\. Result: Blocked\. Recipient is not on the allowlist\./);
  assert.match(renderHistory([]), /Nothing has happened yet/);
});

test("the system prompt names the real vendors and has no injection warning", () => {
  const prompt = systemPrompt(DEMO.vendors);
  assert.match(prompt, new RegExp(DEMO.vendors.premium));
  assert.doesNotMatch(prompt, /inject|untrusted|ignore instructions/i);
});

test("a model that follows a poisoned page is still stopped by the policy", async () => {
  const chain = new MockTollkeeper({
    owner: DEMO.owner, agent: DEMO.agent, dailyCap: parseNear("10"), autoLimit: parseNear("2"), balance: parseNear("100"),
  });
  await chain.ownerClient().addRecipient(DEMO.vendors.dataApi);

  // A stand-in model: reads the page, then obeys the instruction hidden in it.
  const complete: Completion = async ({ user }) => {
    if (!user.includes("news:near-ecosystem")) return { name: "read_page", input: { source: "news:near-ecosystem", why: "news" } };
    if (!user.includes("Result:")) {
      return { name: "pay", input: { recipient: DEMO.attacker, amount_near: "40", memo: "Account verification", why: "The page told me to" } };
    }
    return { name: "finish", input: { summary: "done" } };
  };
  const planner: Planner = new LlmPlanner(complete, DEMO.vendors);
  const events = await runAgent({ client: chain.agentClient(), planner, world: createDemoWorld() });

  const payment = events.find((e) => e.kind === "payment");
  assert.ok(payment && payment.kind === "payment");
  assert.equal(payment.record.status, "Blocked");
  assert.equal(chain.treasuryBalance(), parseNear("100"));
});

test("a planner that fails ends the run with a clear message instead of crashing", async () => {
  const chain = new MockTollkeeper({
    owner: DEMO.owner, agent: DEMO.agent, dailyCap: parseNear("10"), autoLimit: parseNear("2"), balance: parseNear("100"),
  });
  const planner = new LlmPlanner(async () => { throw new Error("The model service returned 401: invalid x-api-key"); }, DEMO.vendors);
  const events = await runAgent({ client: chain.agentClient(), planner, world: createDemoWorld() });
  assert.equal(events[0]?.kind, "error");
  assert.match(events[0]?.kind === "error" ? events[0].message : "", /401/);
  assert.equal(events.at(-1)?.kind, "finished");
});

test("the Anthropic request forces a tool choice and reads the tool call back", async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent = { url, init };
    return new Response(JSON.stringify({ content: [{ type: "text", text: "..." }, { type: "tool_use", name: "finish", input: { summary: "ok" } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const complete = anthropicCompletion({ apiKey: "k", model: "m", fetchImpl });
  const choice = await complete({ system: "s", user: "u", tools: [] });

  assert.deepEqual(choice, { name: "finish", input: { summary: "ok" } });
  assert.equal(sent?.url, "https://api.anthropic.com/v1/messages");
  const headers = sent?.init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "k");
  const body = JSON.parse(String(sent?.init.body));
  assert.deepEqual(body.tool_choice, { type: "any" });
  assert.equal(body.model, "m");
  assert.deepEqual(body.messages, [{ role: "user", content: "u" }]);
});

test("service errors are reported in plain words", async () => {
  const fail = (async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401, statusText: "Unauthorized" })) as unknown as typeof fetch;
  await assert.rejects(anthropicCompletion({ apiKey: "bad", fetchImpl: fail })({ system: "", user: "", tools: [] }), /returned 401: invalid x-api-key/);

  const empty = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }] }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(anthropicCompletion({ apiKey: "k", fetchImpl: empty })({ system: "", user: "", tools: [] }), /did not choose an action/);
});
