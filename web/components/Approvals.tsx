"use client";

import { useState } from "react";
import { formatNear, type PaymentRecord } from "@tollkeeper/shared";

interface Props {
  pending: PaymentRecord[];
  onApprove: (id: number) => Promise<string | null>;
  onDecline: (id: number) => Promise<string | null>;
}

export function Approvals({ pending, onApprove, onDecline }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  async function run(id: number, action: (id: number) => Promise<string | null>) {
    setBusy(id);
    const error = await action(id);
    setBusy(null);
    setErrors((prev) => {
      const next = { ...prev };
      if (error) next[id] = error;
      else delete next[id];
      return next;
    });
  }

  return (
    <section className="section" aria-labelledby="approvals-title">
      <h2 id="approvals-title">Needs your approval</h2>
      {pending.length === 0 ? (
        <p className="empty">Nothing is waiting. Payments above your limit will show up here.</p>
      ) : (
        <ul className="list">
          {pending.map((p) => (
            <li key={p.id} className="row row--ask">
              <div>
                <p className="row__title">
                  {formatNear(p.amount)} to {p.recipient}
                </p>
                {p.memo && <p className="row__memo">{p.memo}</p>}
                <p className="muted">{p.reason}</p>
                {errors[p.id] && (
                  <p className="error" role="alert">
                    Couldn&apos;t do that. {errors[p.id]}
                  </p>
                )}
              </div>
              <div className="actions actions--tight">
                <button type="button" className="btn btn--primary" disabled={busy === p.id} onClick={() => run(p.id, onApprove)}>
                  Approve
                </button>
                <button type="button" className="btn btn--quiet" disabled={busy === p.id} onClick={() => run(p.id, onDecline)}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
