"use client";

import { DemoApp } from "../components/DemoApp";
import { LiveApp } from "../components/LiveApp";

// Set NEXT_PUBLIC_POLICY_ACCOUNT (see web/.env.example) to read the real contract.
// Without it the dashboard runs as a self-contained demo.
const POLICY = process.env.NEXT_PUBLIC_POLICY_ACCOUNT?.trim();
const RPC = process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() || undefined;

export default function Page() {
  return POLICY ? <LiveApp policy={POLICY} rpcUrl={RPC} /> : <DemoApp />;
}
