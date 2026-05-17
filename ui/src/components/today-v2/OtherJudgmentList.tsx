// Other judgment items — spec §5.4, revised for inline expansion.
// Each row is an accordion: the compact summary stays visible while
// expanded so the user keeps their place. Click anywhere on the row
// header to expand / collapse; the full detail (diff, evidence quality,
// missing context, related model links, full actions) opens inline.

import type {
  DecisionDelta,
  DeltaAction,
} from "@/api/today-page-types";
import { StatusChip } from "./StatusChip";
import { InlineDetail } from "./InlineDetail";

interface Props {
  items: DecisionDelta[];
  expandedId: string | null;
  applyingId: string | null;
  onToggle: (id: string) => void;
  onAccept: (id: string) => void;
  onDelegate: (delta: DecisionDelta) => void;
  onCorrect: (delta: DecisionDelta) => void;
  onOpenEvidence: (delta: DecisionDelta) => void;
}

function hasAction(d: DecisionDelta, action: DeltaAction): boolean {
  return d.availableActions.includes(action);
}

export function OtherJudgmentList({
  items,
  expandedId,
  applyingId,
  onToggle,
  onAccept,
  onDelegate,
  onCorrect,
  onOpenEvidence,
}: Props) {
  if (items.length === 0) return null;
  return (
    <section className="tdv2-panel" data-testid="other-judgment-panel">
      <header className="tdv2-panel__head">
        <h3 className="tdv2-panel__title">Other judgment items</h3>
        <span className="tdv2-panel__count">{items.length}</span>
      </header>
      <div className="tdv2-other-list">
        {items.map((d) => {
          const expanded = expandedId === d.id;
          const applying = applyingId === d.id;
          return (
            <article
              key={d.id}
              className={`tdv2-other-card${expanded ? " tdv2-other-card--expanded" : ""}`}
              data-testid={`other-card-${d.id}`}
            >
              <button
                type="button"
                className="tdv2-other-row"
                onClick={() => onToggle(d.id)}
                aria-expanded={expanded}
                aria-controls={`other-detail-${d.id}`}
                data-testid={`other-row-${d.id}`}
              >
                <div>
                  <div className="tdv2-other-row__title">{d.title}</div>
                  {d.summaryLine ? (
                    <div className="tdv2-other-row__summary">{d.summaryLine}</div>
                  ) : null}
                  {d.keyMetrics.length > 0 ? (
                    <div className="tdv2-other-row__metrics">
                      {d.keyMetrics.slice(0, 3).map((m) => m.label).join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="tdv2-other-row__chev">
                  <StatusChip status={d.status} />
                  <span
                    className={`tdv2-other-row__caret${expanded ? " tdv2-other-row__caret--up" : ""}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </div>
              </button>

              {expanded ? (
                <div
                  id={`other-detail-${d.id}`}
                  className="tdv2-other-card__body"
                >
                  {d.whyThisMatters ? (
                    <div className="tdv2-why">
                      <p className="tdv2-why__label">Why this matters</p>
                      <p className="tdv2-why__body">{d.whyThisMatters}</p>
                    </div>
                  ) : null}

                  <InlineDetail
                    delta={d}
                    onOpenEvidence={() => onOpenEvidence(d)}
                  />

                  {d.impactIfAccepted.length > 0 ? (
                    <div className="tdv2-impact">
                      <p className="tdv2-impact__label">If you accept</p>
                      <ul className="tdv2-impact__list">
                        {d.impactIfAccepted.slice(0, 5).map((i) => (
                          <li key={i.id} className="tdv2-impact__item">
                            <span className="tdv2-impact__check" aria-hidden="true">
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                <path
                                  d="M1.5 4.2L3 5.7l3.5-3.5"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                            <span>{i.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="tdv2-actions">
                    {hasAction(d, "accept") ? (
                      <button
                        type="button"
                        className="tdv2-btn tdv2-btn--primary"
                        onClick={() => onAccept(d.id)}
                        disabled={applying}
                        data-testid={`other-accept-${d.id}`}
                      >
                        {applying ? "Applying..." : "Accept change"}
                      </button>
                    ) : null}
                    {hasAction(d, "delegate") ? (
                      <button
                        type="button"
                        className="tdv2-btn tdv2-btn--secondary"
                        onClick={() => onDelegate(d)}
                        data-testid={`other-delegate-${d.id}`}
                      >
                        Delegate
                      </button>
                    ) : null}
                    {hasAction(d, "report_correction") ? (
                      <button
                        type="button"
                        className="tdv2-btn tdv2-btn--correction"
                        onClick={() => onCorrect(d)}
                        data-testid={`other-correct-${d.id}`}
                      >
                        Report correction
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="tdv2-btn tdv2-btn--tertiary"
                      onClick={() => onToggle(d.id)}
                      data-testid={`other-collapse-${d.id}`}
                    >
                      Collapse
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
