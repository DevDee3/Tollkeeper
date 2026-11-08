import type { OwnerClient, PaymentRecord } from "@tollkeeper/shared";
import { createViews, type SendCall, type ViewCall } from "./clients";
import { assertSucceeded } from "./outcome";

/** 50 Tgas, enough for an approval that includes the transfer. */
const OWNER_GAS = "50000000000000";

/** The one thing we need from a connected wallet. NEAR Connect's wallets satisfy it. */
export interface WalletLike {
  signAndSendTransaction(params: {
    signerId?: string;
    receiverId: string;
    actions: Array<{
      type: "FunctionCall";
      params: { methodName: string; args: object; gas: string; deposit: string };
    }>;
  }): Promise<unknown>;
}

/** Sends a call to the policy contract through the user's wallet, and fails with the contract's own message. */
export function walletSender(
  getWallet: () => Promise<WalletLike>,
  policyAccount: string,
  signerId?: string,
): SendCall {
  return async (methodName, args) => {
    const wallet = await getWallet();
    const outcome = await wallet.signAndSendTransaction({
      signerId,
      receiverId: policyAccount,
      actions: [{ type: "FunctionCall", params: { methodName, args, gas: OWNER_GAS, deposit: "0" } }],
    });
    return assertSucceeded(outcome);
  };
}

/** Everything the owner can do. Each write goes through `send`, which is the owner's wallet. */
export function createOwnerClient(view: ViewCall, send: SendCall): OwnerClient {
  const views = createViews(view);

  /** Ids count up from 0 and the log is newest first, so an id's position is (newest id - id). */
  async function recordById(id: number): Promise<PaymentRecord> {
    const [newest] = await views.getLog(0, 1);
    const position = newest ? newest.id - id : -1;
    const [record] = position >= 0 ? await views.getLog(position, 1) : [];
    if (!record || record.id !== id) throw new Error("Done, but the payment record could not be read back. Refresh to see it.");
    return record;
  }

  return {
    ...views,
    approve: async (id) => {
      await send("approve", { id });
      return recordById(id);
    },
    reject: async (id) => {
      await send("reject", { id });
      return recordById(id);
    },
    addRecipient: async (accountId) => void (await send("add_recipient", { account_id: accountId })),
    removeRecipient: async (accountId) => void (await send("remove_recipient", { account_id: accountId })),
    setLimits: async (dailyCap, autoLimit) =>
      void (await send("set_limits", { daily_cap: dailyCap.toString(), auto_limit: autoLimit.toString() })),
    setAgent: async (accountId) => void (await send("set_agent", { agent: accountId })),
  };
}
