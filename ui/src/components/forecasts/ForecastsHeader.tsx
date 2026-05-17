import { PlusIcon, ChevronDownIcon } from "./icons";

export interface ForecastsHeaderProps {
  scope: string;
  range: string;
  onScopeChange?: (s: string) => void;
  onRangeChange?: (r: string) => void;
  onNewScenario: () => void;
}

const SCOPES = ["Company-wide", "Customers", "Engineering", "Pipeline"];
const RANGES = ["Next 14 days", "Next 30 days", "Next 90 days", "Next 180 days"];

export function ForecastsHeader({
  scope,
  range,
  onScopeChange,
  onRangeChange,
  onNewScenario,
}: ForecastsHeaderProps) {
  return (
    <header className="fc-page-header">
      <div className="fc-page-header__titles">
        <h1 className="fc-page-header__title">Forecasts</h1>
        <p className="fc-page-header__subtitle">
          What Fyralis believes may happen next.
        </p>
      </div>
      <div className="fc-page-header__controls">
        <label className="fc-select">
          <span className="fc-select__label">Scope</span>
          <select
            value={scope}
            onChange={(e) => onScopeChange?.(e.target.value)}
            aria-label="Scope"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </label>
        <label className="fc-select">
          <span className="fc-select__label">Range</span>
          <select
            value={range}
            onChange={(e) => onRangeChange?.(e.target.value)}
            aria-label="Range"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </label>
        <button
          type="button"
          className="fc-btn fc-btn--primary"
          onClick={onNewScenario}
        >
          <PlusIcon size={14} />
          <span>New scenario</span>
        </button>
      </div>
    </header>
  );
}

export default ForecastsHeader;
