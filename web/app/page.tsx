"use client";

import { formatNear } from "@tollkeeper/shared";
import { Activity } from "../components/Activity";
import { Approvals } from "../components/Approvals";
import { DayLane } from "../components/DayLane";
import { Rules } from "../components/Rules";
import { Toast } from "../components/Toast";
import { useDemo } from "../lib/useDemo";

export default function Page() {
  const demo = useDemo();
  const { view } = demo;

  if (!view) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const pending = view.log.filter((r) => r.status === "Pending").sort((a, b) => a.id - b.id);

  return (
    <main className="page">
      <header className="header">
        <h1 className="brand">Tollkeeper</h1>
        <p className="muted header__meta">
          Demo mode, nothing is real. Treasury: {formatNear(view.balance)}
        </p>
      </header>

      <DayLane
        config={view.config}
        log={view.log}
        stopHits={demo.stopHits}
        running={demo.running}
        onRun={demo.runDemo}
        onReset={demo.reset}
      />
      <Approvals pending={pending} onApprove={demo.approve} onDecline={demo.decline} />
      <Activity log={view.log} />
      <Rules
        config={view.config}
        allowlist={view.allowlist}
        onSaveLimits={demo.saveLimits}
        onAdd={demo.addRecipient}
        onRemove={demo.removeRecipient}
      />

      <Toast notice={demo.notice} />
    </main>
  );
}
