import type { PredictionRow as PredictionRowT } from "@/api/forecasts-types";
import { StatusChip } from "@/components/primitives";
import { CategoryIcon } from "./icons";
import {
  CATEGORY_LABEL,
  formatDateShort,
  formatPercent,
} from "./format";

export interface ResolvedListProps {
  predictions: PredictionRowT[];
  loading?: boolean;
  error?: string | null;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

export function ResolvedList({
  predictions,
  loading,
  error,
  onSelect,
  selectedId,
}: ResolvedListProps) {
  if (loading && predictions.length === 0) {
    return (
      <div className="fc-state fc-state--loading" data-testid="resolved-loading">
        Loading resolved predictions…
      </div>
    );
  }
  if (error) {
    return (
      <div className="fc-state fc-state--error" role="alert">
        Couldn't load resolved predictions. {error}
      </div>
    );
  }
  if (predictions.length === 0) {
    return (
      <div className="fc-state fc-state--empty">
        Nothing resolved yet in this window.
      </div>
    );
  }

  return (
    <section className="fc-card fc-resolved" aria-label="Resolved predictions">
      <header className="fc-card__header">
        <h2 className="fc-card__title">Resolved predictions</h2>
      </header>
      <ul
        className="fc-resolved__list"
        data-testid="resolved-list"
      >
        {predictions.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`fc-resolved__row${selectedId === p.id ? " fc-resolved__row--selected" : ""}`}
              onClick={() => onSelect?.(p.id)}
              data-testid="resolved-row"
            >
              <span className="fc-resolved__icon" aria-hidden="true">
                <CategoryIcon category={p.category} size={16} />
              </span>
              <span className="fc-resolved__title">{p.statement}</span>
              <span className="fc-resolved__meta">
                <StatusChip variant="forecast">
                  {CATEGORY_LABEL[p.category]}
                </StatusChip>
                <span className="fc-resolved__conf">
                  {formatPercent(p.confidence)}
                </span>
                <OutcomeChip outcome={p.outcome ?? "partial"} />
                <span className="fc-resolved__date">
                  {formatDateShort(p.resolved_at)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OutcomeChip({ outcome }: { outcome: string }) {
  const variant =
    outcome === "true"
      ? "trust"
      : outcome === "false"
        ? "critical"
        : "authority";
  const label =
    outcome === "true" ? "True" : outcome === "false" ? "False" : "Partial";
  return <StatusChip variant={variant}>{label}</StatusChip>;
}

export default ResolvedList;
