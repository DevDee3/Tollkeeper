"use client";

import { useLive } from "../lib/useLive";
import { Dashboard } from "./Dashboard";

/** The dashboard reading the deployed contract, with owner actions signed by the person's wallet. */
export function LiveApp({ policy, rpcUrl }: { policy: string; rpcUrl?: string }) {
  const l = useLive(policy, rpcUrl);
  return (
    <Dashboard
      mode="live"
      view={l.view}
      loadError={l.loadError}
      onRetry={l.retry}
      notice={l.notice}
      stopHits={l.stopHits}
      actions={l.actions}
      wallet={{ accountId: l.accountId, busy: l.walletBusy, connect: l.connect, disconnect: l.disconnect }}
    />
  );
}
