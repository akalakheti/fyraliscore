import type {
  KeyDriver,
  PredictionDetail,
} from "@/api/forecasts-types";
import { RightInspector, StatusChip } from "@/components/primitives";
import { ConfidenceBar } from "./ConfidenceBar";
import { CategoryIcon, InfoIcon } from "./icons";
import {
  CATEGORY_LABEL,
  formatCurrency,
  formatDateLong,
  formatTimeShort,
  relativeDays,
  relativeTime,
} from "./format";

export interface ForecastsInspectorProps {
  detail: PredictionDetail;
  onClose?: () => void;
  onOpenInModel?: () => void;
  onCreateDecisionDelta?: () => void;
}

export function ForecastsInspector({
  detail,
  onClose,
  onOpenInModel,
  onCreateDecisionDelta,
}: ForecastsInspectorProps) {
  const p = detail.prediction;
  const signals = detail.signals;
  const visibleSignals = signals.slice(0, 5);
  const extra = signals.length - visibleSignals.length;

  const impactedArr =
    typeof p.impact?.arr_at_risk === "number" ? p.impact.arr_at_risk : null;

  return (
    <RightInspector
      onClose={onClose}
      canBack={false}
      canForward={false}
      classification={
        <StatusChip variant="forecast">
          <CategoryIcon category={p.category} size={12} />
          <span style={{ marginLeft: 6 }}>{CATEGORY_LABEL[p.category]}</span>
        </StatusChip>
      }
      title={p.statement}
      body={
        <>
          {p.rationale ? (
            <p className="fc-insp__rationale">{p.rationale}</p>
          ) : null}

          <section className="fc-insp__section">
            <h3 className="fc-insp__subhead">Prediction</h3>
            <ConfidenceBar value={p.confidence} />
          </section>

          {p.falsification_condition ? (
            <section className="fc-insp__section">
              <h3 className="fc-insp__subhead">
                What would change this?
                <InfoIcon />
              </h3>
              <p className="fc-insp__body-text">{p.falsification_condition}</p>
            </section>
          ) : null}

          <section className="fc-insp__section">
            <h3 className="fc-insp__subhead">
              Supporting signals ({signals.length})
            </h3>
            <div
              className="fc-insp__signal-row"
              data-testid="inspector-signals"
            >
              {visibleSignals.map((s) => (
                <span key={s.id} className="fc-insp__signal-chip" title={s.title}>
                  <SourceIcon src={s.source} />
                </span>
              ))}
              {extra > 0 ? (
                <span className="fc-insp__signal-chip fc-insp__signal-chip--more">
                  +{extra}
                </span>
              ) : null}
            </div>
          </section>

          {p.key_drivers && p.key_drivers.length > 0 ? (
            <section className="fc-insp__section">
              <h3 className="fc-insp__subhead">Key drivers</h3>
              <ul
                className="fc-insp__drivers"
                data-testid="inspector-drivers"
              >
                {p.key_drivers.map((d, i) => (
                  <DriverRow key={i} driver={d} />
                ))}
              </ul>
            </section>
          ) : null}

          {p.target_label ? (
            <section className="fc-insp__section">
              <h3 className="fc-insp__subhead">Impacted</h3>
              <div className="fc-insp__impacted">
                <span className="fc-insp__impacted-icon" aria-hidden="true">
                  <CategoryIcon category={p.category} size={14} />
                </span>
                <span className="fc-insp__impacted-name">{p.target_label}</span>
                {impactedArr !== null ? (
                  <span className="fc-insp__impacted-arr">
                    {formatCurrency(impactedArr)}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="fc-insp__section">
            <h3 className="fc-insp__subhead">Recommended actions</h3>
            <ul className="fc-insp__actions">
              <li>
                <button type="button" className="fc-link">
                  Escalate to VP Engineering <span aria-hidden="true">→</span>
                </button>
              </li>
              <li>
                <button type="button" className="fc-link">
                  Increase account touchpoints <span aria-hidden="true">→</span>
                </button>
              </li>
            </ul>
          </section>

          <section className="fc-insp__meta">
            <div>
              <div className="fc-insp__meta-label">Created</div>
              <div className="fc-insp__meta-value">
                {formatDateLong(p.created_at)}
              </div>
              <div className="fc-insp__meta-sub">
                {formatTimeShort(p.created_at)}
              </div>
            </div>
            <div>
              <div className="fc-insp__meta-label">Last updated</div>
              <div className="fc-insp__meta-value">
                {relativeTime(p.updated_at)}
              </div>
              <div className="fc-insp__meta-sub">by Fyralis</div>
            </div>
            <div>
              <div className="fc-insp__meta-label">Resolution by</div>
              <div className="fc-insp__meta-value">
                {formatDateLong(p.resolution_at)}
              </div>
              <div className="fc-insp__meta-sub">
                {relativeDays(p.resolution_at)}
              </div>
            </div>
          </section>
        </>
      }
      footerActions={
        <>
          <button
            type="button"
            className="fc-btn fc-btn--primary"
            onClick={onOpenInModel}
            data-testid="inspector-view-in-model"
          >
            View in model
          </button>
          <button
            type="button"
            className="fc-btn fc-btn--ghost"
            onClick={onCreateDecisionDelta}
          >
            Create decision delta
          </button>
        </>
      }
    />
  );
}

function DriverRow({ driver }: { driver: KeyDriver }) {
  const toneClass =
    driver.tone === "negative"
      ? " fc-insp__driver-delta--negative"
      : driver.tone === "positive"
        ? " fc-insp__driver-delta--positive"
        : "";
  return (
    <li className="fc-insp__driver">
      <span className="fc-insp__driver-title">{driver.title}</span>
      {driver.delta ? (
        <span className={`fc-insp__driver-delta${toneClass}`}>{driver.delta}</span>
      ) : null}
    </li>
  );
}

function SourceIcon({ src }: { src: string }) {
  const letter = (src || "?").charAt(0).toUpperCase();
  return (
    <span className="fc-insp__src-icon" aria-label={src}>
      {letter}
    </span>
  );
}

export default ForecastsInspector;
