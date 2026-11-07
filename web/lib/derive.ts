import type { PaymentRecord } from "@tollkeeper/shared";

const MS_PER_DAY = 86_400_000;
const MIN_PCT = 0.8; // keep very small payments visible

export interface Segment {
  id: number;
  pct: number;
  recipient: string;
  amount: string;
  kind: "paid" | "waiting";
}

/** Same UTC-day rule as the contract. */
export function isToday(timestampMs: number, nowMs: number): boolean {
  return Math.floor(timestampMs / MS_PER_DAY) === Math.floor(nowMs / MS_PER_DAY);
}

/**
 * The pieces of today's lane: payments already made first, then payments
 * waiting for approval. Widths are a share of the daily limit, and the waiting
 * pieces are trimmed so the lane never draws past the gate.
 */
export function laneSegments(dailyCap: bigint, log: readonly PaymentRecord[], nowMs: number): Segment[] {
  if (dailyCap <= 0n) return [];
  const today = log.filter((r) => isToday(r.timestamp_ms, nowMs)).sort((a, b) => a.id - b.id);
  const pick = (status: PaymentRecord["status"], kind: Segment["kind"]): Segment[] =>
    today
      .filter((r) => r.status === status)
      .map((r) => ({
        id: r.id,
        pct: Math.max(Number((BigInt(r.amount) * 10_000n) / dailyCap) / 100, MIN_PCT),
        recipient: r.recipient,
        amount: r.amount,
        kind,
      }));

  const paid = pick("Paid", "paid");
  let room = Math.max(100 - paid.reduce((sum, s) => sum + s.pct, 0), 0);
  const waiting: Segment[] = [];
  for (const s of pick("Pending", "waiting")) {
    const pct = Math.min(s.pct, room);
    if (pct <= 0) break;
    waiting.push({ ...s, pct });
    room -= pct;
  }
  return [...paid, ...waiting];
}

export function counts(log: readonly PaymentRecord[], nowMs: number): { waiting: number; stoppedToday: number } {
  return {
    waiting: log.filter((r) => r.status === "Pending").length,
    stoppedToday: log.filter((r) => r.status === "Blocked" && isToday(r.timestamp_ms, nowMs)).length,
  };
}

/** "Nothing waiting. Nothing stopped today." / "1 payment waiting for you. 2 stopped today." */
export function summaryLine(waiting: number, stopped: number): string {
  const w = waiting === 0 ? "Nothing waiting for you." : `${waiting} ${waiting === 1 ? "payment" : "payments"} waiting for you.`;
  const s = stopped === 0 ? "Nothing stopped today." : `${stopped} stopped today.`;
  return `${w} ${s}`;
}

/** "6.25 NEAR" -> "6.25", for places where the unit is shown separately. */
export function withoutUnit(formatted: string): string {
  return formatted.replace(/ NEAR$/, "");
}

export function clockTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
