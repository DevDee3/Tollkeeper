"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MockTollkeeper, parseNear, type OwnerClient, type PaymentRecord } from "@tollkeeper/shared";
import { DEMO, NaivePlanner, createDemoWorld, runAgent, type Planner } from "@tollkeeper/agent";
import { announcement } from "./derive";
import type { Notice, View } from "./types";

/** Pause between the agent's steps so a person can follow what happens. */
const PACE_MS = 1100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function freshChain(): Promise<MockTollkeeper> {
  const chain = new MockTollkeeper({
    owner: DEMO.owner,
    agent: DEMO.agent,
    dailyCap: parseNear("10"),
    autoLimit: parseNear("2"),
    balance: parseNear("100"),
  });
  for (const vendor of Object.values(DEMO.vendors)) await chain.ownerClient().addRecipient(vendor);
  return chain;
}

/**
 * Demo mode: the dashboard talks to the in-memory copy of the contract.
 * Going live means returning the same shape from a NEAR-backed client instead.
 * Every action returns an error message to show, or null when it worked.
 */
export function useDemo() {
  const chain = useRef<MockTollkeeper | null>(null);
  const noticeId = useRef(0);
  const [view, setView] = useState<View | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [stopHits, setStopHits] = useState(0);

  const say = useCallback((tone: Notice["tone"], text: string) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, tone, text });
  }, []);

  const refresh = useCallback(async () => {
    const c = chain.current;
    if (!c) return;
    const owner = c.ownerClient();
    const [config, allowlist, log] = await Promise.all([owner.getConfig(), owner.getAllowlist(), owner.getLog(0, 100)]);
    setView({ config, allowlist, log, balance: c.treasuryBalance() });
  }, []);

  const reset = useCallback(async () => {
    chain.current = await freshChain();
    setStopHits(0);
    setNotice(null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void reset();
  }, [reset]);

  const announce = useCallback(
    (record: PaymentRecord) => {
      const a = announcement(record);
      if (!a) return;
      if (record.status === "Blocked") setStopHits((n) => n + 1);
      say(a.tone, a.text);
    },
    [say],
  );

  const runDemo = useCallback(async () => {
    const c = chain.current;
    if (!c || running) return;
    setRunning(true);
    const base = new NaivePlanner();
    const paced: Planner = {
      async next(history) {
        await sleep(PACE_MS);
        return base.next(history);
      },
    };
    try {
      await runAgent({
        client: c.agentClient(),
        planner: paced,
        world: createDemoWorld(),
        onEvent: (event) => {
          if (event.kind !== "payment") return;
          void refresh();
          announce(event.record);
        },
      });
    } finally {
      setRunning(false);
      await refresh();
    }
  }, [announce, refresh, running]);

  const act = useCallback(
    async (fn: (owner: OwnerClient) => Promise<unknown>, done: string): Promise<string | null> => {
      const c = chain.current;
      if (!c) return "Not ready yet. Try again in a moment.";
      try {
        await fn(c.ownerClient());
        await refresh();
        say("go", done);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [refresh, say],
  );

  return {
    view,
    running,
    notice,
    stopHits,
    runDemo,
    reset,
    approve: (id: number) => act((o) => o.approve(id), "Approved. The payment was sent."),
    decline: (id: number) => act((o) => o.reject(id), "Declined. Nothing was sent."),
    addRecipient: (account: string) => act((o) => o.addRecipient(account), `Added ${account} to allowed recipients.`),
    removeRecipient: (account: string) =>
      act((o) => o.removeRecipient(account), `Removed ${account} from allowed recipients.`),
    saveLimits: (cap: bigint, auto: bigint) => act((o) => o.setLimits(cap, auto), "Rules saved."),
  };
}

export type Demo = ReturnType<typeof useDemo>;
