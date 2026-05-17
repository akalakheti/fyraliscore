import type { AccuracyResponse } from "@/api/forecasts-types";
import { StatusChip } from "@/components/primitives";
import {
  CATEGORY_LABEL,
  formatDateShort,
  formatPercent,
} from "./format";

export interface AccuracyPanelProps {
  data: AccuracyResponse | null;
  loading?: boolean;
  error?: string | null;
}

export function AccuracyPanel({ data, loading, error }: AccuracyPanelProps) {
  if (loading && !data) {
    return (
      <div className="fc-state fc-state--loading" data-testid="accuracy-loading">
        Loading accuracy data…
      </div>
    );
  }
  if (error) {
    return (
      <div className="fc-state fc-state--error" role="alert">
        Accuracy unavailable. {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="fc-state fc-state--empty">
        No accuracy data in this window.
      </div>
    );
  }

  const summary = data.calibration_summary;

  return (
    <div className="fc-accuracy" data-testid="accuracy-panel">
      <section className="fc-card">
        <header className="fc-card__header">
          <h2 className="fc-card__title">Calibration bins</h2>
          {typeof summary.value === "number" ? (
            <div className="fc-accuracy__overall">
              Overall calibration {summary.value.toFixed(2)}
            </div>
          ) : null}
        </header>
        <div className="fc-accuracy__bins" data-testid="accuracy-bins">
          {data.bins.map((b) => (
            <div className="fc-accuracy__bin" key={b.bin_label}>
              <div className="fc-accuracy__bin-label">{b.bin_label}</div>
              <div className="fc-accuracy__bin-meta">
                <span>Predicted {formatPercent(b.predicted_rate)}</span>
                <span>
                  Observed{" "}
                  {b.observed_hit_rate === null
                    ? "n/a"
                    : formatPercent(b.observed_hit_rate)}
                </span>
                <span>n={b.n_resolved}</span>
              </div>
              <div className="fc-accuracy__bin-bar">
                <div
                  className="fc-accuracy__bin-bar-pred"
                  style={{ width: `${b.predicted_rate * 100}%` }}
                  aria-hidden="true"
                />
                {b.observed_hit_rate !== null ? (
                  <div
                    className="fc-accuracy__bin-bar-obs"
                    style={{ width: `${b.observed_hit_rate * 100}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fc-card">
        <header className="fc-card__header">
          <h2 className="fc-card__title">Recent resolutions</h2>
        </header>
        <ul className="fc-accuracy__recent">
          {data.recent_resolutions.map((r) => (
            <li key={r.id} className="fc-accuracy__recent-row">
              <span className="fc-accuracy__recent-date">
                {formatDateShort(r.resolved_at)}
              </span>
              <span className="fc-accuracy__recent-title">{r.statement}</span>
              <span className="fc-accuracy__recent-meta">
                <StatusChip variant="forecast">
                  {CATEGORY_LABEL[r.category]}
                </StatusChip>
                <span>{formatPercent(r.confidence)}</span>
                <OutcomeChip outcome={r.outcome} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
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

export default AccuracyPanel;
