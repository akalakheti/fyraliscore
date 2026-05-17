// Primary Judgment card — spec §5.3. The hero of Briefing Mode.
// Shows: type label, status chip, title, summaryLine + keyMetrics,
// whyThisMatters block, mini-diff, impactIfAccepted checklist,
// and an actions row. Clicking the card enters Focused Review Mode.

import type { DecisionDelta } from "@/api/today-page-types";
import { StatusChip } from "./StatusChip";
import { MiniDiff } from "./MiniDiff";

interface Props {
  delta: DecisionDelta;
  onOpen: () => void;
  onAccept: () => void;
  onDelegate: () => void;
  onCorrect: () => void;
  applying?: boolean;
}

export function PrimaryJudgmentCard({
  delta,
  onOpen,
  onAccept,
  onDelegate,
  onCorrect,
  applying = false,
}: Props) {
  // Primary action varies by status (spec §5.3). Monitoring & delegated
  // can't be "accepted" in the user sense; respect the available action
  // list.
  const canAccept = delta.availableActions.includes("accept");
  const canDelegate = delta.availableActions.includes("delegate");
  const isDelegatable = delta.status === "delegatable";
  const isMonitoring = delta.status === "monitoring";

  const cardClass = [
    "tdv2-primary",
    isDelegatable ? "tdv2-primary--delegatable" : "",
    isMonitoring ? "tdv2-primary--monitoring" : "",
    delta.status === "contested" || delta.status === "correction_submitted"
      ? "tdv2-primary--contested"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={cardClass} data-testid="primary-judgment">
      <div className="tdv2-label-row">
        <div className="tdv2-label">Primary judgment</div>
        <StatusChip status={delta.status} />
      </div>

      <button
        type="button"
        className="tdv2-primary__title-btn"
        onClick={onOpen}
        style={{ background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}
        data-testid="primary-judgment-open"
      >
        <h2 className="tdv2-primary__title">{delta.title}</h2>
      </button>

      {delta.summaryLine ? (
        <p className="tdv2-primary__summary">{delta.summaryLine}</p>
      ) : null}

      {delta.keyMetrics.length > 0 ? (
        <div className="tdv2-metrics" data-testid="key-metrics">
          {delta.keyMetrics.map((m, i) => (
            <span
              key={i}
              className={`tdv2-metric${
                m.severity === "critical" ? " tdv2-metric--critical" : m.severity === "high" ? " tdv2-metric--high" : ""
              }`}
            >
              {m.label}
            </span>
          ))}
        </div>
      ) : null}

      {delta.whyThisMatters ? (
        <div className="tdv2-why">
          <p className="tdv2-why__label">Why this matters</p>
          <p className="tdv2-why__body">{delta.whyThisMatters}</p>
        </div>
      ) : null}

      <MiniDiff
        current={delta.currentState}
        proposed={delta.proposedState}
        maxRows={3}
      />

      {delta.impactIfAccepted.length > 0 ? (
        <div className="tdv2-impact">
          <p className="tdv2-impact__label">If you accept</p>
          <ul className="tdv2-impact__list">
            {delta.impactIfAccepted.slice(0, 5).map((i) => (
              <li key={i.id} className="tdv2-impact__item">
                <span className="tdv2-impact__check" aria-hidden="true">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4.2L3 5.7l3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tdv2-actions">
        {isDelegatable ? (
          <>
            {canDelegate ? (
              <button
                type="button"
                className="tdv2-btn tdv2-btn--primary"
                onClick={onDelegate}
                data-testid="primary-delegate"
              >
                Delegate
              </button>
            ) : null}
            {canAccept ? (
              <button
                type="button"
                className="tdv2-btn tdv2-btn--secondary"
                onClick={onAccept}
                disabled={applying}
                data-testid="primary-accept"
              >
                {applying ? "Applying..." : "Accept change"}
              </button>
            ) : null}
          </>
        ) : (
          <>
            {canAccept ? (
              <button
                type="button"
                className="tdv2-btn tdv2-btn--primary"
                onClick={onAccept}
                disabled={applying}
                data-testid="primary-accept"
              >
                {applying ? "Applying..." : "Accept change"}
              </button>
            ) : null}
            {canDelegate ? (
              <button
                type="button"
                className="tdv2-btn tdv2-btn--secondary"
                onClick={onDelegate}
                data-testid="primary-delegate"
              >
                Delegate
              </button>
            ) : null}
          </>
        )}
        <button
          type="button"
          className="tdv2-btn tdv2-btn--tertiary"
          onClick={onOpen}
          data-testid="primary-review"
        >
          Review evidence
        </button>
        {delta.availableActions.includes("report_correction") ? (
          <button
            type="button"
            className="tdv2-btn tdv2-btn--correction"
            onClick={onCorrect}
            data-testid="primary-correct"
          >
            Report correction
          </button>
        ) : null}
      </div>
    </section>
  );
}
