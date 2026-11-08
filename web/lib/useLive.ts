"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_RPC_URL,
  connectTreasury,
  connectView,
  createOwnerClient,
  createViews,
  walletSender,
} from "@tollkeeper/chain";
import type { OwnerClient } from "@tollkeeper/shared";
import type { NearConnector } from "@hot-labs/near-connect";
import { announcement, unseen } from "./derive";
import type { Notice, OwnerActions, View } from "./types";

const POLL_MS = 3000;
const NETWORK = "testnet";

/**
 * Live mode: reads the deployed contract every few seconds, so payments show up as
 * the agent makes them, and signs owner actions with the wallet the person connects.
 */
export function useLive(policy: string, rpcUrl?: string) {
  const reader = useMemo(() => {
    const url = rpcUrl || DEFAULT_RPC_URL;
    const view = connectView(url, policy);
    return { view, views: createViews(view), treasury: connectTreasury(url, policy) };
  }, [policy, rpcUrl]);

  const connector = useRef<NearConnector | null>(null);
  const lastSeen = useRef<number | null>(null);
  const noticeId = useRef(0);
  const [view, setView] = useState<View | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [stopHits, setStopHits] = useState(0);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);

  const say = useCallback((tone: Notice["tone"], text: string) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, tone, text });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [config, allowlist, log, balance] = await Promise.all([
        reader.views.getConfig(),
        reader.views.getAllowlist(),
        reader.views.getLog(0, 100),
        reader.treasury(),
      ]);
      setView({ config, allowlist, log, balance });
      setLoadError(null);

      const newest = log[0]?.id ?? -1;
      if (lastSeen.current === null) {
        lastSeen.current = newest; // first look: nothing is "new"
      } else if (newest > lastSeen.current) {
        for (const record of unseen(log, lastSeen.current)) {
          const a = announcement(record);
          if (!a) continue;
          if (record.status === "Blocked") setStopHits((n) => n + 1);
          say(a.tone, a.text);
        }
        lastSeen.current = newest;
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [reader, say]);

  // Keep the screen current while the tab is open and visible.
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The wallet library touches browser storage, so it loads in the browser only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      if (cancelled) return;
      const c = new NearConnector({ network: NETWORK, features: { signAndSendTransaction: true } });
      connector.current = c;
      c.on("wallet:signIn", ({ accounts }) => setAccountId(accounts[0]?.accountId ?? null));
      c.on("wallet:signOut", () => setAccountId(null));
      try {
        const { accounts } = await c.getConnectedWallet(); // restores an earlier session
        if (!cancelled) setAccountId(accounts[0]?.accountId ?? null);
      } catch {
        // No earlier session. The person connects with the button.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    const c = connector.current;
    if (!c) return say("info", "The wallet is still loading. Try again in a moment.");
    setWalletBusy(true);
    try {
      const wallet = await c.connect();
      const accounts = await wallet.getAccounts();
      setAccountId(accounts[0]?.accountId ?? null);
    } catch {
      say("info", "No wallet was connected.");
    } finally {
      setWalletBusy(false);
    }
  }, [say]);

  const disconnect = useCallback(async () => {
    try {
      await connector.current?.disconnect();
    } finally {
      setAccountId(null);
    }
  }, []);

  const act = useCallback(
    async (fn: (owner: OwnerClient) => Promise<unknown>, done: string): Promise<string | null> => {
      const c = connector.current;
      if (!c || !accountId) return "Connect your wallet first, using the button at the top.";
      const owner = view?.config.owner;
      if (owner && accountId !== owner) return `You're connected as ${accountId}. Only ${owner} can do this.`;
      try {
        await fn(createOwnerClient(reader.view, walletSender(() => c.wallet(), policy, accountId)));
        await refresh();
        say("go", done);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [accountId, policy, reader, refresh, say, view],
  );

  const actions: OwnerActions = {
    approve: (id) => act((o) => o.approve(id), "Approved. The payment was sent."),
    decline: (id) => act((o) => o.reject(id), "Declined. Nothing was sent."),
    addRecipient: (account) => act((o) => o.addRecipient(account), `Added ${account} to allowed recipients.`),
    removeRecipient: (account) => act((o) => o.removeRecipient(account), `Removed ${account} from allowed recipients.`),
    saveLimits: (cap, auto) => act((o) => o.setLimits(cap, auto), "Rules saved."),
  };

  return { view, loadError, notice, stopHits, accountId, walletBusy, connect, disconnect, retry: refresh, actions };
}
