export type ForecastsTabId = "active" | "resolved" | "accuracy";

export interface ForecastsTabsProps {
  active: ForecastsTabId;
  onChange: (tab: ForecastsTabId) => void;
  counts?: Partial<Record<ForecastsTabId, number>>;
}

const TABS: { id: ForecastsTabId; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
  { id: "accuracy", label: "Accuracy" },
];

export function ForecastsTabs({ active, onChange, counts }: ForecastsTabsProps) {
  return (
    <div className="fc-tabs" role="tablist" aria-label="Forecasts tabs">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const count = counts?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`fc-tab${isActive ? " fc-tab--active" : ""}`}
            onClick={() => onChange(tab.id)}
            data-testid={`forecasts-tab-${tab.id}`}
          >
            <span>{tab.label}</span>
            {typeof count === "number" ? (
              <span className="fc-tab__count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default ForecastsTabs;
