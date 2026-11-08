import type { Config, PaymentRecord } from "@tollkeeper/shared";

/** Everything the dashboard shows, whether it comes from the demo or the live contract. */
export interface View {
  config: Config;
  allowlist: string[];
  /** Newest first. */
  log: PaymentRecord[];
  /** Treasury in yoctoNEAR. */
  balance: bigint;
}

/** One short message at the bottom of the screen. */
export interface Notice {
  id: number;
  tone: "stop" | "go" | "info";
  text: string;
}

/** What an owner action returns: an error to show, or null when it worked. */
export type ActionResult = Promise<string | null>;

export interface OwnerActions {
  approve(id: number): ActionResult;
  decline(id: number): ActionResult;
  addRecipient(account: string): ActionResult;
  removeRecipient(account: string): ActionResult;
  saveLimits(cap: bigint, auto: bigint): ActionResult;
}
