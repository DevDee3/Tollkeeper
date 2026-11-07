import { YOCTO_PER_NEAR } from "./units";
import type { AgentClient, Config, OwnerClient, PaymentRecord, Status, ViewApi } from "./types";

/**
 * An in-memory copy of the policy contract, with the same rules and the same
 * messages as contracts/policy/src/lib.rs. It lets the demo, the dashboard and
 * the tests run before anything is deployed.
 *
 * KEEP IN SYNC: if a rule changes in the contract, change it here and in
 * shared/test/mock.test.ts (whose test names mirror the contract's tests).
 */

const MS_PER_DAY = 86_400_000;
const MAX_MEMO_BYTES = 200;
const MAX_PAGE = 100;
const RESERVE = YOCTO_PER_NEAR / 2n; // 0.5 NEAR, same as the contract

export interface MockOptions {
  owner: string;
  agent: string;
  dailyCap: bigint;
  autoLimit: bigint;
  /** Treasury balance in yoctoNEAR. */
  balance: bigint;
  /** Injectable clock (ms), so tests can move between days. */
  now?: () => number;
}

export class MockTollkeeper {
  private readonly owner: string;
  private agent: string;
  private dailyCap: bigint;
  private autoLimit: bigint;
  private balance: bigint;
  private readonly now: () => number;
  private readonly allowlist = new Set<string>();
  private readonly log: PaymentRecord[] = [];
  private day: number;
  private spentToday = 0n;

  constructor(opts: MockOptions) {
    if (opts.autoLimit > opts.dailyCap) {
      throw new Error("Auto-approve limit cannot exceed the daily cap");
    }
    this.owner = opts.owner;
    this.agent = opts.agent;
    this.dailyCap = opts.dailyCap;
    this.autoLimit = opts.autoLimit;
    this.balance = opts.balance;
    this.now = opts.now ?? Date.now;
    this.day = this.today();
  }

  /** What the agent's restricted key can do. */
  agentClient(): AgentClient {
    return {
      ...this.views(),
      requestPayment: async (recipient, amount, memo) => this.requestPayment(recipient, amount, memo),
    };
  }

  /** What the owner can do. */
  ownerClient(): OwnerClient {
    return {
      ...this.views(),
      approve: async (id) => this.approve(id),
      reject: async (id) => this.reject(id),
      addRecipient: async (a) => void this.allowlist.add(a),
      removeRecipient: async (a) => void this.allowlist.delete(a),
      setLimits: async (cap, auto) => {
        if (auto > cap) throw new Error("Auto-approve limit cannot exceed the daily cap");
        this.dailyCap = cap;
        this.autoLimit = auto;
      },
      setAgent: async (a) => void (this.agent = a),
    };
  }

  /** Treasury balance, for the dashboard header. Not part of the contract's views. */
  treasuryBalance(): bigint {
    return this.balance;
  }

  // ------------------------------------------------------------------ views

  private views(): ViewApi {
    return {
      getConfig: async () => this.config(),
      getAllowlist: async () => [...this.allowlist],
      isAllowed: async (a) => this.allowlist.has(a),
      getLog: async (from = 0, limit = 20) =>
        [...this.log].reverse().slice(from, from + Math.min(limit, MAX_PAGE)),
      getPending: async () => this.log.filter((r) => r.status === "Pending"),
    };
  }

  private config(): Config {
    const spent = this.currentSpent();
    const remaining = this.dailyCap > spent ? this.dailyCap - spent : 0n;
    return {
      owner: this.owner,
      agent: this.agent,
      daily_cap: this.dailyCap.toString(),
      auto_limit: this.autoLimit.toString(),
      spent_today: spent.toString(),
      remaining_today: remaining.toString(),
    };
  }

  // ------------------------------------------------------------------ agent

  private requestPayment(recipient: string, amount: bigint, memo: string): PaymentRecord {
    if (amount <= 0n) throw new Error("Amount must be greater than zero");
    if (new TextEncoder().encode(memo).length > MAX_MEMO_BYTES) throw new Error("Memo is too long");
    this.rollDay();

    let status: Status;
    let reason: string;
    if (!this.allowlist.has(recipient)) {
      [status, reason] = ["Blocked", "Recipient is not on the allowlist"];
    } else if (this.spentToday + amount > this.dailyCap) {
      [status, reason] = ["Blocked", "Would exceed the daily spending cap"];
    } else if (!this.hasFunds(amount)) {
      [status, reason] = ["Blocked", "Not enough funds in the treasury"];
    } else if (amount > this.autoLimit) {
      [status, reason] = ["Pending", "Above what the agent can pay on its own. Waiting for your approval"];
    } else {
      [status, reason] = ["Paid", "Within all limits"];
    }

    const record = this.push(recipient, amount, memo, status, reason);
    if (status === "Paid") this.pay(amount);
    return { ...record };
  }

  // ------------------------------------------------------------------ owner

  private approve(id: number): PaymentRecord {
    this.rollDay();
    const rec = this.record(id);
    if (rec.status !== "Pending") throw new Error("Payment is not waiting for approval");
    if (!this.allowlist.has(rec.recipient)) throw new Error("Recipient is no longer on the allowlist");
    const amount = BigInt(rec.amount);
    if (this.spentToday + amount > this.dailyCap) throw new Error("Approving this would exceed the daily cap");
    if (!this.hasFunds(amount)) throw new Error("Not enough funds in the treasury");
    this.pay(amount);
    rec.status = "Paid";
    rec.reason = "Approved by you";
    return { ...rec };
  }

  private reject(id: number): PaymentRecord {
    const rec = this.record(id);
    if (rec.status !== "Pending") throw new Error("Payment is not waiting for approval");
    rec.status = "Rejected";
    rec.reason = "Declined by you";
    return { ...rec };
  }

  // ---------------------------------------------------------------- helpers

  private pay(amount: bigint): void {
    this.spentToday += amount;
    this.balance -= amount;
  }

  private push(recipient: string, amount: bigint, memo: string, status: Status, reason: string): PaymentRecord {
    const rec: PaymentRecord = {
      id: this.log.length,
      recipient,
      amount: amount.toString(),
      memo,
      status,
      reason,
      timestamp_ms: this.now(),
    };
    this.log.push(rec);
    return rec;
  }

  private record(id: number): PaymentRecord {
    const rec = this.log[id];
    if (!rec) throw new Error("Unknown payment id");
    return rec;
  }

  private hasFunds(amount: bigint): boolean {
    return (this.balance > RESERVE ? this.balance - RESERVE : 0n) >= amount;
  }

  private today(): number {
    return Math.floor(this.now() / MS_PER_DAY);
  }

  private rollDay(): void {
    const now = this.today();
    if (now !== this.day) {
      this.day = now;
      this.spentToday = 0n;
    }
  }

  private currentSpent(): bigint {
    return this.day === this.today() ? this.spentToday : 0n;
  }
}
