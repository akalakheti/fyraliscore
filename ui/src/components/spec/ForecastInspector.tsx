import { useNavigate } from "react-router-dom";

import type { SpecForecast } from "@/api/spec-forecast-types";

import { Confidence } from "./Confidence";
import { ContextGapList } from "./ContextGaps";
import { EvidenceTraceView } from "./EvidenceTraceView";
import { SourceCoverageList } from "./SourceCoverage";

interface Props {
  forecast: SpecForecast;
  onClose: () => void;
}

// Forecast inspector — spec §13.7.
export function ForecastInspector({ forecast, onClose }: Props) {
  const navigate = useNavigate();
  return (
    <div className="fx-inspector" data-testid="forecast-inspector">
      <header className="fx-inspector__head">
        <div>
          <div className="fx-delta__type">Forecast</div>
          <h2 className="fx-inspector__title">{forecast.statement}</h2>
          <div className="fx-inspector__subtitle">
            Domain: {forecast.domain} · {forecast.resolutionDate ? `Resolves ${forecast.resolutionDate}` : "Open horizon"}
          </div>
        </div>
        <button type="button" className="fx-inspector__close" aria-label="Close" onClick={onClose}>×</button>
      </header>

      <section className="fx-inspector__section">
        <div className="fx-inspector__section-label">Confidence</div>
        <Confidence value={forecast.confidence} previous={forecast.confidencePrevious} />
      </section>

      {forecast.leadingIndicators.length > 0 ? (
        <section className="fx-inspector__section">
          <div className="fx-inspector__section-label">Leading indicators</div>
          <ul className="fx-inspector__body" style={{ paddingLeft: 18 }}>
            {forecast.leadingIndicators.map((l, i) => (
              <li key={i}>
                {l.label}
                {l.movement ? <span className="fx-muted"> · {l.movement}</span> : null}
                {l.detail ? <div className="fx-muted" style={{ fontSize: 12 }}>{l.detail}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fx-inspector__section">
        <div className="fx-inspector__section-label">Evidence trace</div>
        <EvidenceTraceView trace={forecast.evidenceTrace} />
      </section>

      <section className="fx-inspector__section">
        <div className="fx-inspector__section-label">Source coverage</div>
        <SourceCoverageList items={forecast.sourceCoverage} />
      </section>

      <ContextGapList gaps={forecast.contextGaps} />

      {forecast.falsificationCondition ? (
        <section className="fx-inspector__section">
          <div className="fx-inspector__section-label">Would revise if</div>
          <div className="fx-inspector__body fx-muted" style={{ fontSize: 13 }}>
            {forecast.falsificationCondition}
          </div>
        </section>
      ) : null}

      {forecast.outcome ? (
        <section className="fx-inspector__section">
          <div className="fx-inspector__section-label">Outcome</div>
          <div className="fx-inspector__body">
            Resolved <strong>{forecast.outcome}</strong>
            {forecast.calibrationImpact != null ? (
              <span className="fx-muted"> · calibration impact {forecast.calibrationImpact > 0 ? "+" : ""}{forecast.calibrationImpact.toFixed(2)}</span>
            ) : null}
            {forecast.outcomeNote ? <div className="fx-muted">{forecast.outcomeNote}</div> : null}
          </div>
        </section>
      ) : null}

      <div className="fx-inspector__actions">
        {forecast.relatedThreadId ? (
          <button type="button" className="fx-btn" onClick={() => navigate(`/model?thread=${forecast.relatedThreadId}`)}>
            View in Model →
          </button>
        ) : null}
        {forecast.relatedDeltaId ? (
          <button type="button" className="fx-btn fx-btn--gold" onClick={() => navigate(`/?delta=${forecast.relatedDeltaId}`)}>
            Open intervention →
          </button>
        ) : null}
      </div>
    </div>
  );
}
