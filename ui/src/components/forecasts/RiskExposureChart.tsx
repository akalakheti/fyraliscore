import { useMemo } from "react";
import type { RiskExposureResponse } from "@/api/forecasts-types";
import { ChevronDownIcon } from "./icons";
import { formatCurrency, formatDateShort } from "./format";

export interface RiskExposureChartProps {
  data: RiskExposureResponse | null;
  metric: string;
  onMetricChange?: (m: string) => void;
  total: number;
  deltaAbs?: number;
  deltaPct?: number;
  loading?: boolean;
  error?: string | null;
}

const METRICS = [
  { id: "arr_at_risk", label: "Total ARR at risk" },
  { id: "customers_affected", label: "Customers affected" },
  { id: "capacity_pct", label: "Capacity exposure" },
];

const VIEW_W = 560;
const VIEW_H = 180;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 28;

export function RiskExposureChart({
  data,
  metric,
  onMetricChange,
  total,
  deltaAbs,
  deltaPct,
  loading,
  error,
}: RiskExposureChartProps) {
  const buckets = data?.buckets ?? [];

  const { pathD, areaD, xTicks } = useMemo(() => {
    if (buckets.length === 0) {
      return { pathD: "", areaD: "", xTicks: [] as { x: number; label: string }[] };
    }
    const values = buckets.map((b) => b.value);
    const max = Math.max(...values, 1);
    const w = VIEW_W - PAD_L - PAD_R;
    const h = VIEW_H - PAD_T - PAD_B;
    const stepX = buckets.length > 1 ? w / (buckets.length - 1) : 0;
    const xy = buckets.map((b, i) => {
      const x = PAD_L + stepX * i;
      const y = PAD_T + h - (b.value / max) * h;
      return { x, y };
    });
    const pathD = xy
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const first = xy[0];
    const last = xy[xy.length - 1];
    const areaD = `${pathD} L ${last.x.toFixed(1)} ${PAD_T + h} L ${first.x.toFixed(1)} ${PAD_T + h} Z`;
    const tickIndices = buckets.length <= 4
      ? buckets.map((_, i) => i)
      : [0, Math.floor(buckets.length / 3), Math.floor((2 * buckets.length) / 3), buckets.length - 1];
    const xTicks = tickIndices.map((i) => ({
      x: xy[i].x,
      label: i === 0 ? "Today" : formatDateShort(buckets[i].bucket_start),
    }));
    return { pathD, areaD, xTicks };
  }, [buckets]);

  const deltaUp = (deltaAbs ?? 0) >= 0;
  const showDelta = typeof deltaAbs === "number" && typeof deltaPct === "number";

  return (
    <section
      className="fc-card fc-risk"
      aria-label="Risk exposure over time"
      data-testid="risk-exposure-card"
    >
      <header className="fc-card__header">
        <div>
          <h2 className="fc-card__title">Risk exposure over time</h2>
        </div>
        <label className="fc-select fc-select--sm">
          <select
            aria-label="Risk metric"
            value={metric}
            onChange={(e) => onMetricChange?.(e.target.value)}
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </label>
      </header>

      <div className="fc-risk__lead">
        <div className="fc-risk__total" data-testid="risk-total">
          {metric === "arr_at_risk" ? formatCurrency(total) : total.toFixed(0)}
        </div>
        <div className="fc-risk__label">Total</div>
        {showDelta ? (
          <div
            className={`fc-risk__delta${deltaUp ? "" : " fc-risk__delta--down"}`}
            data-testid="risk-delta"
          >
            {deltaUp ? "↗" : "↘"}{" "}
            {metric === "arr_at_risk"
              ? formatCurrency(Math.abs(deltaAbs))
              : Math.abs(deltaAbs).toFixed(0)}{" "}
            ({Math.abs(Math.round(deltaPct * 100))}%) vs last week
          </div>
        ) : null}
      </div>

      <div className="fc-risk__chart-wrap">
        {loading && buckets.length === 0 ? (
          <div className="fc-state fc-state--loading">Loading…</div>
        ) : error ? (
          <div className="fc-state fc-state--error" role="alert">
            Risk exposure unavailable.
          </div>
        ) : buckets.length === 0 ? (
          <div className="fc-state fc-state--empty">No exposure in window.</div>
        ) : (
          <svg
            className="fc-risk__chart"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Risk exposure line chart"
            data-testid="risk-exposure-svg"
          >
            <defs>
              <linearGradient id="fcRiskArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-deep-garnet)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-deep-garnet)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => {
              const y = PAD_T + (VIEW_H - PAD_T - PAD_B) * f;
              return (
                <line
                  key={f}
                  x1={PAD_L}
                  y1={y}
                  x2={VIEW_W - PAD_R}
                  y2={y}
                  stroke="var(--color-stone-veil)"
                  strokeOpacity="0.6"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
              );
            })}
            <path d={areaD} fill="url(#fcRiskArea)" />
            <path
              d={pathD}
              fill="none"
              stroke="var(--color-deep-garnet)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              data-testid="risk-exposure-line"
            />
            {xTicks.map((t, i) => (
              <text
                key={i}
                x={t.x}
                y={VIEW_H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-weathered-sage)"
              >
                {t.label}
              </text>
            ))}
          </svg>
        )}
      </div>
    </section>
  );
}

export default RiskExposureChart;
