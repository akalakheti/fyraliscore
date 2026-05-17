import type { PredictionRow as PredictionRowT } from "@/api/forecasts-types";
import { StatusChip } from "@/components/primitives";
import { CategoryIcon, ChevronRightIcon } from "./icons";
import {
  CATEGORY_LABEL,
  formatCurrency,
  formatDateShort,
  formatPercent,
  relativeDays,
} from "./format";

export interface PredictionRowProps {
  prediction: PredictionRowT;
  selected?: boolean;
  onSelect?: () => void;
}

export function PredictionRow({
  prediction,
  selected,
  onSelect,
}: PredictionRowProps) {
  const arr = typeof prediction.impact?.arr_at_risk === "number"
    ? prediction.impact.arr_at_risk
    : null;
  const rel = relativeDays(prediction.resolution_at);
  return (
    <button
      type="button"
      className={`fc-prediction-row${selected ? " fc-prediction-row--selected" : ""}`}
      data-prediction-id={prediction.id}
      data-testid="prediction-row"
      onClick={onSelect}
      aria-pressed={selected ? true : false}
    >
      <span className="fc-prediction-row__icon" aria-hidden="true">
        <CategoryIcon category={prediction.category} size={18} />
      </span>
      <span className="fc-prediction-row__body">
        <span className="fc-prediction-row__title">{prediction.statement}</span>
        {prediction.rationale ? (
          <span className="fc-prediction-row__rationale">
            {prediction.rationale}
          </span>
        ) : null}
        <span className="fc-prediction-row__chips">
          <StatusChip variant="forecast">
            {CATEGORY_LABEL[prediction.category]}
          </StatusChip>
          {prediction.target_label ? (
            <StatusChip variant="neutral">{prediction.target_label}</StatusChip>
          ) : null}
        </span>
      </span>
      <span className="fc-prediction-row__metrics">
        <span className="fc-prediction-row__metric">
          <span className="fc-prediction-row__metric-label">ARR impact</span>
          <span className="fc-prediction-row__metric-value">
            {arr !== null ? formatCurrency(arr) : "—"}
          </span>
        </span>
        <span className="fc-prediction-row__metric">
          <span className="fc-prediction-row__metric-label">Confidence</span>
          <span className="fc-prediction-row__metric-value">
            {formatPercent(prediction.confidence)}
          </span>
        </span>
      </span>
      <span className="fc-prediction-row__date">
        <span className="fc-prediction-row__date-abs">
          {formatDateShort(prediction.resolution_at)}
        </span>
        {rel ? (
          <span className="fc-prediction-row__date-rel">{rel}</span>
        ) : null}
      </span>
      <span className="fc-prediction-row__chev" aria-hidden="true">
        <ChevronRightIcon size={14} />
      </span>
    </button>
  );
}

export default PredictionRow;
