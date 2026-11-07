/**
 * Wire types for the Tollkeeper policy contract (contracts/policy).
 * These mirror the contract's JSON exactly, so they are the single place the
 * agent, the dashboard and the contract have to agree on.
 *
 * Amounts are yoctoNEAR (10^-24 NEAR) as decimal strings, because the
 * contract's U128 type is serialised as a string.
 */

export type Status = "Paid" | "Pending" | "Blocked" | "Rejected";

export interface PaymentRecord {
  id: number;
  recipient: string;
  amount: string;
  memo: string;
  status: Status;
  /** Plain-language explanation, safe to show to the user as is. */
  reason: string;
  timestamp_ms: number;
}

export interface Config {
  owner: string;
  agent: string;
  daily_cap: string;
  auto_limit: string;
  spent_today: string;
  remaining_today: string;
}

/** Read-only calls. Anyone can make these. */
export interface ViewApi {
  getConfig(): Promise<Config>;
  getAllowlist(): Promise<string[]>;
  isAllowed(accountId: string): Promise<boolean>;
  /** Newest first. */
  getLog(fromIndex?: number, limit?: number): Promise<PaymentRecord[]>;
  getPending(): Promise<PaymentRecord[]>;
}

/**
 * The only write the agent's key is allowed to make. A rule violation is
 * returned as a Blocked record, never thrown.
 */
export interface AgentApi {
  requestPayment(recipient: string, amountYocto: bigint, memo: string): Promise<PaymentRecord>;
}

/** Writes that need the owner's key. The agent never gets these. */
export interface OwnerApi {
  approve(id: number): Promise<PaymentRecord>;
  reject(id: number): Promise<PaymentRecord>;
  addRecipient(accountId: string): Promise<void>;
  removeRecipient(accountId: string): Promise<void>;
  setLimits(dailyCapYocto: bigint, autoLimitYocto: bigint): Promise<void>;
  setAgent(accountId: string): Promise<void>;
}

export type AgentClient = ViewApi & AgentApi;
export type OwnerClient = ViewApi & OwnerApi;
