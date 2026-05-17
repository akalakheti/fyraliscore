// Focused Review card — spec §6. The deepest default review state
// before specialized drawers. Shows the full DecisionDelta with diff,
// evidence summary, missing context, impact preview, and actions.

import type { DecisionDelta } from "@/api/today-page-types";
import { StatusChip } from "./StatusChip";
import { MiniDiff } from "./MiniDiff";

interface Props {
  delta: DecisionDelta;
  position: { index: number; total: number };
  applying?: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onAccept: () => void;
  onDelegate: () => void;
  onCorrect: () => void;
  onOpenEvidence: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

function relativeTime(iso: string): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return iso;
  const delta = Date.now() - created;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FocusedReviewCard({
  delta,
  position,
  applying = false,
  onBack,
  onPrev,
  onNext,
  onAccept,
  onDelegate,
  onCorrect,
  onOpenEvidence,
  hasPrev,
  hasNext,
}: Props) {
  const canAccept = delta.availableActions.includes("accept");
  const canDelegate = delta.availableActions.includes("delegate");
  const canCorrect = delta.availableActions.includes("report_correction");

  return (
    <section className="tdv2-focused" data-testid="focused-review-card">
      <header className="tdv2-focused__head">
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <button
            type="button"
            className="tdv2-back-btn"
            onClick={onBack}
            data-testid="focused-back"
          >
            ← Back to Today
          </button>
          <span
            className="tdv2-header__reviewing"
            tabIndex={-1}
            data-testid="focused-reviewing"
          >
            Reviewing {position.index + 1} of {position.total}
          </span>
        </div>
        <div className="tdv2-focused__nav">
          <button
            type="button"
            className="tdv2-focused__nav-btn"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label="Previous proposed change"
          >
            ↑
          </button>
          <button
            type="button"
            className="tdv2-focused__nav-btn"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next proposed change"
          >
            ↓
          </button>
          <StatusChip status={delta.status} />
        </div>
      </header>

      <div>
        <div className="tdv2-focused__type-label">Proposed change</div>
        <h1 className="tdv2-focused__title">{delta.title}</h1>
        <div className="tdv2-focused__meta">
          <span>From {labelForCategory(delta.sourceCategory)}</span>
          <span>·</span>
          <span>Proposed by {proposedByLabel(delta.proposedBy)}</span>
          <span>·</span>
          <span>Created {relativeTime(delta.createdAt)}</span>
        </div>
      </div>

      <div className="tdv2-focused__section">
        <h3 className="tdv2-focused__section-label">Current → Proposed</h3>
        <MiniDiff
          current={delta.currentState}
          proposed={delta.proposedState}
          showHeader
        />
      </div>

      <div className="tdv2-focused__grid">
        <div className="tdv2-focused__section">
          <h3 className="tdv2-focused__section-label">Why this matters</h3>
          <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.55, color: "var(--text-primary)" }}>
            {delta.whyThisMatters || "—"}
          </p>
        </div>

        <div className="tdv2-focused__section">
          <h3 className="tdv2-focused__section-label">
            Evidence quality · {delta.evidenceSummary.totalSignals} signals
          </h3>
          <ul className="tdv2-evidence-list">
            {delta.evidenceSummary.groups.map((g) => (
              <li key={g.id} className="tdv2-evidence-list__item">
                <span>{g.label} <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>×{g.count}</span></span>
                <span className={`tdv2-evidence-list__quality tdv2-evidence-list__quality--${g.quality}`}>
                  {g.quality}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="tdv2-btn tdv2-btn--tertiary"
            onClick={onOpenEvidence}
            data-testid="focused-review-evidence"
            style={{ alignSelf: "flex-start", padding: "6px 0" }}
          >
            Review all evidence →
          </button>
        </div>

        <div className="tdv2-focused__section">
          <h3 className="tdv2-focused__section-label">What may be missing</h3>
          {delta.missingContext.length > 0 ? (
            <ul className="tdv2-missing">
              {delta.missingContext.map((m) => (
                <li key={m.id} className="tdv2-missing__item">{m.text}</li>
              ))}
            </ul>
          ) : (
            <p className="tdv2-missing__empty">No major context gaps identified.</p>
          )}
        </div>
      </div>

      {delta.impactIfAccepted.length > 0 ? (
        <div className="tdv2-impact">
          <p className="tdv2-impact__label">Impact if accepted</p>
          <ul className="tdv2-impact__list">
            {delta.impactIfAccepted.map((i) => (
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

      {delta.relatedModelLinks.length > 0 ? (
        <div className="tdv2-focused__section">
          <h3 className="tdv2-focused__section-label">Related model context</h3>
          <div className="tdv2-related">
            {delta.relatedModelLinks.map((l) => (
              <a key={l.category} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="tdv2-actions">
        {canAccept ? (
          <button
            type="button"
            className="tdv2-btn tdv2-btn--primary"
            onClick={onAccept}
            disabled={applying}
            data-testid="focused-accept"
          >
            {applying ? "Applying..." : "Accept change"}
          </button>
        ) : null}
        {canDelegate ? (
          <button
            type="button"
            className="tdv2-btn tdv2-btn--secondary"
            onClick={onDelegate}
            data-testid="focused-delegate"
          >
            Delegate
          </button>
        ) : null}
        <button
          type="button"
          className="tdv2-btn tdv2-btn--tertiary"
          onClick={onOpenEvidence}
        >
          Review evidence
        </button>
        {canCorrect ? (
          <button
            type="button"
            className="tdv2-btn tdv2-btn--correction"
            onClick={onCorrect}
            data-testid="focused-correct"
          >
            Report correction
          </button>
        ) : null}
      </div>
    </section>
  );
}

function labelForCategory(c: DecisionDelta["sourceCategory"]): string {
  switch (c) {
    case "goals_priorities":  return "Goals & Priorities";
    case "commitments":       return "Commitments";
    case "decisions":         return "Decisions";
    case "risks_constraints": return "Risks & Constraints";
    case "customers_revenue": return "Customers & Revenue";
    case "people_teams":      return "People & Teams";
    case "systems_capacity":  return "Systems & Capacity";
    case "finance_capital":   return "Finance & Capital";
    default:                  return c;
  }
}

function proposedByLabel(p: DecisionDelta["proposedBy"]): string {
  if (p === "fyralis") return "Fyralis";
  if (p === "user") return "you";
  return "system";
}
