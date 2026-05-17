// Inline detail panel — the deep-dive content shown when a judgment
// card is expanded in Briefing. Renders the extra sections (full diff
// with header, evidence quality, missing context, related model links)
// that would otherwise live on the standalone /today/review page.
//
// Designed to plug into both PrimaryJudgmentCard (always rendered)
// and OtherJudgmentList rows (rendered when the row is expanded), so
// the user never has to leave the page to drill in.

import type { DecisionDelta } from "@/api/today-page-types";
import { MiniDiff } from "./MiniDiff";

interface Props {
  delta: DecisionDelta;
  onOpenEvidence: () => void;
  // When true, the parent (e.g. PrimaryJudgmentCard) has already shown
  // an abbreviated MiniDiff above, so we skip ours to avoid duplication.
  hideDiff?: boolean;
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

export function InlineDetail({ delta, onOpenEvidence, hideDiff = false }: Props) {
  return (
    <div className="tdv2-inline-detail" data-testid={`inline-detail-${delta.id}`}>
      {!hideDiff ? (
        <div className="tdv2-focused__section">
          <h3 className="tdv2-focused__section-label">Current → Proposed</h3>
          <MiniDiff
            current={delta.currentState}
            proposed={delta.proposedState}
            showHeader
          />
        </div>
      ) : null}

      <div className="tdv2-inline-detail__source">
        <span>From {labelForCategory(delta.sourceCategory)}</span>
        <span>·</span>
        <span>
          Proposed by{" "}
          {delta.proposedBy === "fyralis"
            ? "Fyralis"
            : delta.proposedBy === "user"
              ? "you"
              : "system"}
        </span>
      </div>

      <div className="tdv2-focused__grid">
        <div className="tdv2-focused__section">
          <h3 className="tdv2-focused__section-label">
            Evidence quality · {delta.evidenceSummary.totalSignals} signals
          </h3>
          <ul className="tdv2-evidence-list">
            {delta.evidenceSummary.groups.map((g) => (
              <li key={g.id} className="tdv2-evidence-list__item">
                <span>
                  {g.label}
                  <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>
                    ×{g.count}
                  </span>
                </span>
                <span
                  className={`tdv2-evidence-list__quality tdv2-evidence-list__quality--${g.quality}`}
                >
                  {g.quality}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="tdv2-btn tdv2-btn--tertiary"
            onClick={onOpenEvidence}
            data-testid={`inline-review-evidence-${delta.id}`}
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
      </div>
    </div>
  );
}
