"use client";

import { useDemo } from "../lib/useDemo";
import { Dashboard } from "./Dashboard";

/** The dashboard running on the in-memory contract. Nothing here is real. */
export function DemoApp() {
  const d = useDemo();
  return (
    <Dashboard
      mode="demo"
      view={d.view}
      notice={d.notice}
      stopHits={d.stopHits}
      actions={{
        approve: d.approve,
        decline: d.decline,
        addRecipient: d.addRecipient,
        removeRecipient: d.removeRecipient,
        saveLimits: d.saveLimits,
      }}
      demo={{ running: d.running, run: d.runDemo, reset: d.reset }}
    />
  );
}
