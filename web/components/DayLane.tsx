import { formatNear, type Config, type PaymentRecord } from "@tollkeeper/shared";
import { counts, laneSegments, summaryLine, withoutUnit } from "../lib/derive";

interface Props {
  config: Config;
  log: PaymentRecord[];
  /** Goes up each time a payment is stopped, which replays the gate flash. */
  stopHits: number;
  /** Only passed in demo mode. In live mode the agent runs on its own. */
  demo?: { running: boolean; run: () => void; reset: () => void };
}

export function DayLane({ config, log, stopHits, demo }: Props) {
  const now = Date.now();
  const segments = laneSegments(BigInt(config.daily_cap), log, now);
  const { waiting, stoppedToday } = counts(log, now);

  return (
    <section className="section" aria-labelledby="today-title">
      <h2 id="today-title" className="visually-hidden">
        Today
      </h2>
      <p className="spent">
        <span className="spent__number">{withoutUnit(formatNear(config.spent_today))}</span>{" "}
        <span className="spent__unit">NEAR spent today</span>
      </p>
      <p className="muted">of your {formatNear(config.daily_cap)} daily limit</p>

      <div className="lane" role="img" aria-label={`${formatNear(config.spent_today)} of ${formatNear(config.daily_cap)} spent today`}>
        <div className="lane__track">
          {segments.map((s) => (
            <span
              key={s.id}
              className={`lane__piece lane__piece--${s.kind}`}
              style={{ flexBasis: `${s.pct}%` }}
              title={`${formatNear(s.amount)} to ${s.recipient}${s.kind === "waiting" ? " (waiting for approval)" : ""}`}
            />
          ))}
        </div>
        <span key={stopHits} className={stopHits > 0 ? "lane__gate lane__gate--hit" : "lane__gate"} />
      </div>
      <p className="lane__caption muted">
        <span className="key key--paid" /> Paid <span className="key key--waiting" /> Waiting for you
      </p>

      <p className="summary">{summaryLine(waiting, stoppedToday)}</p>

      {demo && (
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={demo.run} disabled={demo.running}>
            {demo.running ? "Agent is working…" : "Run the agent demo"}
          </button>
          <button type="button" className="btn btn--quiet" onClick={demo.reset} disabled={demo.running}>
            Start over
          </button>
        </div>
      )}
    </section>
  );
}
