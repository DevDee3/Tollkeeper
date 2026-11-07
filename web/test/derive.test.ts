import { test } from "node:test";
import assert from "node:assert/strict";
import type { PaymentRecord } from "@tollkeeper/shared";
import { counts, laneSegments, summaryLine, withoutUnit } from "../lib/derive";

const NEAR = 10n ** 24n;
const NOW = 5 * 86_400_000 + 1000;

function rec(id: number, near: number, status: PaymentRecord["status"], ts = NOW): PaymentRecord {
  return { id, recipient: `r${id}.testnet`, amount: (BigInt(near) * NEAR).toString(), memo: "", status, reason: "", timestamp_ms: ts };
}

test("lane shows paid payments first, then waiting ones, as a share of the daily limit", () => {
  const segs = laneSegments(10n * NEAR, [rec(0, 1, "Paid"), rec(1, 6, "Pending"), rec(2, 2, "Paid")], NOW);
  assert.deepEqual(segs.map((s) => [s.id, s.kind, s.pct]), [[0, "paid", 10], [2, "paid", 20], [1, "waiting", 60]]);
});

test("blocked, declined and yesterday's payments do not appear in the lane", () => {
  const log = [rec(0, 1, "Blocked"), rec(1, 1, "Rejected"), rec(2, 1, "Paid", NOW - 86_400_000)];
  assert.deepEqual(laneSegments(10n * NEAR, log, NOW), []);
});

test("waiting pieces are trimmed so the lane never passes the gate", () => {
  const segs = laneSegments(10n * NEAR, [rec(0, 8, "Paid"), rec(1, 6, "Pending")], NOW);
  assert.equal(segs[1]?.pct, 20);
  assert.ok(segs.reduce((n, s) => n + s.pct, 0) <= 100);
});

test("tiny payments stay visible", () => {
  const segs = laneSegments(1000n * NEAR, [rec(0, 1, "Paid")], NOW);
  assert.equal(segs[0]?.pct, 0.8);
});

test("counts and summary line read in plain language", () => {
  const log = [rec(0, 6, "Pending"), rec(1, 40, "Blocked"), rec(2, 1, "Blocked", NOW - 86_400_000)];
  const c = counts(log, NOW);
  assert.deepEqual(c, { waiting: 1, stoppedToday: 1 });
  assert.equal(summaryLine(1, 1), "1 payment waiting for you. 1 stopped today.");
  assert.equal(summaryLine(0, 0), "Nothing waiting for you. Nothing stopped today.");
  assert.equal(summaryLine(2, 3), "2 payments waiting for you. 3 stopped today.");
});

test("withoutUnit drops the trailing unit", () => {
  assert.equal(withoutUnit("6.25 NEAR"), "6.25");
});
