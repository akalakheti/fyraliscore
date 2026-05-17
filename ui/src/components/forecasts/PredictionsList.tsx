import type {
  ForecastSort,
  PredictionRow as PredictionRowT,
} from "@/api/forecasts-types";
import { PredictionRow } from "./PredictionRow";
import { ChevronDownIcon, PlusIcon } from "./icons";

export interface PredictionsListProps {
  predictions: PredictionRowT[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  sort: ForecastSort;
  onSortChange: (s: ForecastSort) => void;
  onNewScenario?: () => void;
  loading?: boolean;
  error?: string | null;
}

const SORT_LABEL: Record<ForecastSort, string> = {
  earliest_resolution: "Earliest resolution",
  latest_resolution: "Latest resolution",
  highest_confidence: "Highest confidence",
  created: "Newest",
};

const SORT_OPTIONS: ForecastSort[] = [
  "earliest_resolution",
  "latest_resolution",
  "highest_confidence",
  "created",
];

export function PredictionsList({
  predictions,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  onNewScenario,
  loading,
  error,
}: PredictionsListProps) {
  return (
    <section className="fc-card fc-predictions" aria-label="Predictions">
      <header className="fc-card__header">
        <h2 className="fc-card__title">Predictions</h2>
        <div className="fc-card__controls">
          <label className="fc-sort">
            <span className="fc-sort__label">Sort by</span>
            <select
              aria-label="Sort predictions"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as ForecastSort)}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
            <ChevronDownIcon />
          </label>
          {onNewScenario ? (
            <button
              type="button"
              className="fc-icon-btn"
              aria-label="New scenario"
              onClick={onNewScenario}
              data-testid="predictions-new-scenario"
            >
              <PlusIcon size={14} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="fc-predictions__body" data-testid="predictions-body">
        {loading && predictions.length === 0 ? (
          <div className="fc-state fc-state--loading">Loading predictions…</div>
        ) : error ? (
          <div className="fc-state fc-state--error" role="alert">
            Couldn't load predictions. {error}
          </div>
        ) : predictions.length === 0 ? (
          <div className="fc-state fc-state--empty">
            No active predictions in this scope.
          </div>
        ) : (
          predictions.map((p) => (
            <PredictionRow
              key={p.id}
              prediction={p}
              selected={p.id === selectedId}
              onSelect={() => onSelect(p.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default PredictionsList;
