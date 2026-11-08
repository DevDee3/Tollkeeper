import { formatNear, type PaymentRecord, type Status } from "@tollkeeper/shared";
import { clockTime } from "../lib/derive";

/** What each contract status is called on screen. */
const LABEL: Record<Status, string> = {
  Paid: "Paid",
  Pending: "Waiting",
  Blocked: "Stopped",
  Rejected: "Declined",
};

export function Activity({ log, emptyHint }: { log: PaymentRecord[]; emptyHint: string }) {
  return (
    <section className="section" aria-labelledby="activity-title">
      <h2 id="activity-title">Activity</h2>
      {log.length === 0 ? (
        <p className="empty">{emptyHint}</p>
      ) : (
        <ul className="list">
          {log.map((r) => (
            <li key={r.id} className="row row--activity">
              <span className={`chip chip--${r.status.toLowerCase()}`}>{LABEL[r.status]}</span>
              <div>
                <p className="row__title">
                  {formatNear(r.amount)} to {r.recipient}
                </p>
                <p className="muted">{r.reason}</p>
              </div>
              <time className="muted row__time" dateTime={new Date(r.timestamp_ms).toISOString()}>
                {clockTime(r.timestamp_ms)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
