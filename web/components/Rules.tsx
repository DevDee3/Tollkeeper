"use client";

import { useState, type FormEvent } from "react";
import { formatNear, parseNear, type Config } from "@tollkeeper/shared";
import { withoutUnit } from "../lib/derive";

interface Props {
  config: Config;
  allowlist: string[];
  onSaveLimits: (dailyCap: bigint, autoLimit: bigint) => Promise<string | null>;
  onAdd: (account: string) => Promise<string | null>;
  onRemove: (account: string) => Promise<string | null>;
}

const ACCOUNT = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function Rules({ config, allowlist, onSaveLimits, onAdd, onRemove }: Props) {
  return (
    <section className="section" aria-labelledby="rules-title">
      <h2 id="rules-title">Rules</h2>
      {/* Keyed so the fields reset when the saved values change. */}
      <LimitsForm key={`${config.daily_cap}-${config.auto_limit}`} config={config} onSave={onSaveLimits} />
      <Recipients allowlist={allowlist} onAdd={onAdd} onRemove={onRemove} />
    </section>
  );
}

function LimitsForm({ config, onSave }: { config: Config; onSave: Props["onSaveLimits"] }) {
  const [cap, setCap] = useState(withoutUnit(formatNear(config.daily_cap)));
  const [auto, setAuto] = useState(withoutUnit(formatNear(config.auto_limit)));
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let capValue: bigint;
    let autoValue: bigint;
    try {
      capValue = parseNear(cap);
      autoValue = parseNear(auto);
    } catch {
      setError("Enter amounts like 10 or 2.5.");
      return;
    }
    if (capValue === 0n) return setError("The daily limit must be more than 0.");
    if (autoValue > capValue) return setError("The amount the agent can pay on its own can't be higher than the daily limit.");
    setError(await onSave(capValue, autoValue));
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="cap">Daily limit (NEAR)</label>
        <input id="cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
        <p className="hint">The most the agent can spend in one day. It resets at midnight UTC.</p>
      </div>
      <div className="field">
        <label htmlFor="auto">Agent pays on its own up to (NEAR)</label>
        <input id="auto" inputMode="decimal" value={auto} onChange={(e) => setAuto(e.target.value)} />
        <p className="hint">Anything bigger waits for your approval.</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary">
        Save rules
      </button>
    </form>
  );
}

function Recipients({ allowlist, onAdd, onRemove }: Pick<Props, "allowlist" | "onAdd" | "onRemove">) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const account = value.trim().toLowerCase();
    if (!ACCOUNT.test(account)) return setError("Enter a NEAR account, like shop.testnet.");
    if (allowlist.includes(account)) return setError(`${account} is already allowed.`);
    const failure = await onAdd(account);
    setError(failure);
    if (!failure) setValue("");
  }

  return (
    <div className="recipients">
      <h3>Allowed recipients</h3>
      <p className="hint">The agent can only pay accounts on this list. Everything else is stopped.</p>
      {allowlist.length === 0 ? (
        <p className="empty">No one is allowed yet, so every payment will be stopped.</p>
      ) : (
        <ul className="list">
          {allowlist.map((account) => (
            <li key={account} className="row row--recipient">
              <span>{account}</span>
              <button type="button" className="btn btn--text" aria-label={`Remove ${account}`} onClick={() => onRemove(account)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="form form--inline" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="recipient">Add a recipient</label>
          <input
            id="recipient"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="shop.testnet"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--quiet">
          Add
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
