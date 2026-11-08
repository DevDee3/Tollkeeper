import { formatNear } from "@tollkeeper/shared";
import type { Notice, OwnerActions, View } from "../lib/types";
import { Activity } from "./Activity";
import { Approvals } from "./Approvals";
import { DayLane } from "./DayLane";
import { Rules } from "./Rules";
import { Toast } from "./Toast";

export interface DashboardModel {
  mode: "demo" | "live";
  view: View | null;
  /** Set when the first read of the contract failed. */
  loadError?: string | null;
  onRetry?: () => void;
  notice: Notice | null;
  stopHits: number;
  actions: OwnerActions;
  /** Demo mode only: buttons that run the scripted agent. */
  demo?: { running: boolean; run: () => void; reset: () => void };
  /** Live mode only: the owner's wallet. */
  wallet?: { accountId: string | null; busy: boolean; connect: () => void; disconnect: () => void };
}

const EMPTY_HINT = {
  demo: "No activity yet. Run the agent demo to watch it work.",
  live: "No activity yet. When the agent asks for a payment, it appears here.",
} as const;

export function Dashboard({ mode, view, loadError, onRetry, notice, stopHits, actions, demo, wallet }: DashboardModel) {
  if (!view) {
    return (
      <main className="page">
        {loadError ? (
          <section className="section">
            <h2>Couldn&apos;t reach the contract</h2>
            <p className="muted">Check your internet connection and the contract name, then try again.</p>
            <p className="hint">{loadError}</p>
            {onRetry && (
              <div className="actions">
                <button type="button" className="btn btn--primary" onClick={onRetry}>
                  Try again
                </button>
              </div>
            )}
          </section>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </main>
    );
  }

  const pending = view.log.filter((r) => r.status === "Pending").sort((a, b) => a.id - b.id);
  const owner = view.config.owner;
  const note =
    mode === "demo"
      ? `Demo mode, nothing is real. Treasury: ${formatNear(view.balance)}`
      : `Live on NEAR testnet. Treasury: ${formatNear(view.balance)}`;

  let banner: string | null = null;
  if (wallet && !wallet.accountId) {
    banner = "Connect your wallet to approve payments or change the rules. You can watch without one.";
  } else if (wallet?.accountId && wallet.accountId !== owner) {
    banner = `You're connected as ${wallet.accountId}, but only ${owner} can approve payments or change the rules.`;
  }

  return (
    <main className="page">
      <header className="header">
        <h1 className="brand">Tollkeeper</h1>
        <div className="header__right">
          <p className="muted header__meta">{note}</p>
          {wallet &&
            (wallet.accountId ? (
              <button type="button" className="btn btn--quiet" onClick={wallet.disconnect} aria-label={`Disconnect ${wallet.accountId}`}>
                {wallet.accountId} · Disconnect
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={wallet.connect} disabled={wallet.busy}>
                {wallet.busy ? "Connecting…" : "Connect wallet"}
              </button>
            ))}
        </div>
      </header>

      {banner && <p className="banner">{banner}</p>}

      <DayLane config={view.config} log={view.log} stopHits={stopHits} demo={demo} />
      <Approvals pending={pending} onApprove={actions.approve} onDecline={actions.decline} />
      <Activity log={view.log} emptyHint={EMPTY_HINT[mode]} />
      <Rules
        config={view.config}
        allowlist={view.allowlist}
        onSaveLimits={actions.saveLimits}
        onAdd={actions.addRecipient}
        onRemove={actions.removeRecipient}
      />

      <Toast notice={notice} />
    </main>
  );
}
