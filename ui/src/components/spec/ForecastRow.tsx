import type { SpecForecast } from "@/api/spec-forecast-types";

import { Confidence } from "./Confidence";

interface Props {
  forecast: SpecForecast;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

// Forecast row — spec §13.6. Default rail color is Veiled Iris; other
// severity hints override.
export function ForecastRow({ forecast, selected, onSelect }: Props) {
  const railClass =
    forecast.severityHint === "critical"
      ? "fx-rail--critical"
      : forecast.severityHint === "review"
        ? "fx-rail--needs-review"
        : forecast.severityHint === "authority"
          ? "fx-rail--authority"
          : "fx-rail--forecast";

  return (
    <article
      className={`fx-card fx-forecast-row${selected ? " fx-forecast-row--selected" : ""}`}
      onClick={() => onSelect?.(forecast.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(forecast.id);
        }
      }}
    >
      <div className={`fx-rail ${railClass}`} aria-hidden="true" />
      <div className="fx-card__body">
        <div className="fx-forecast-row__statement">{forecast.statement}</div>
        <div className="fx-forecast-row__meta">
          <Confidence value={forecast.confidence} previous={forecast.confidencePrevious} compact />
          {forecast.resolutionDate ? (
            <span>· resolves {forecast.resolutionDate}</span>
          ) : null}
          {forecast.relatedThreadTitle ? (
            <span>· from <strong>{forecast.relatedThreadTitle}</strong></span>
          ) : null}
          {forecast.interventionLabel ? (
            <span>· Intervention: {forecast.interventionLabel}</span>
          ) : null}
        </div>
        {forecast.leadingIndicators.length > 0 ? (
          <div className="fx-forecast-row__indicators">
            Indicators: {forecast.leadingIndicators.map((l) => l.label).join(" · ")}
          </div>
        ) : null}
      </div>
    </article>
  );
}
