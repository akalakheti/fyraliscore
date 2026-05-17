import type { PredictionRow as PredictionRowT } from "@/api/forecasts-types";
import { CategoryIcon, ChevronRightIcon } from "./icons";
import { formatDateShort, relativeDays } from "./format";

export interface UpcomingResolutionsProps {
  items: PredictionRowT[];
  onSelect?: (id: string) => void;
  onViewAll?: () => void;
  loading?: boolean;
  error?: string | null;
}

export function UpcomingResolutions({
  items,
  onSelect,
  onViewAll,
  loading,
  error,
}: UpcomingResolutionsProps) {
  return (
    <section
      className="fc-card fc-upcoming"
      aria-label="Resolutions next 14 days"
      data-testid="upcoming-card"
    >
      <header className="fc-card__header">
        <h2 className="fc-card__title">Resolutions next 14 days</h2>
      </header>
      <ul className="fc-upcoming__list">
        {loading && items.length === 0 ? (
          <li className="fc-state fc-state--loading">Loading…</li>
        ) : error ? (
          <li className="fc-state fc-state--error" role="alert">
            Unavailable.
          </li>
        ) : items.length === 0 ? (
          <li className="fc-state fc-state--empty">Nothing resolving soon.</li>
        ) : (
          items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="fc-upcoming__row"
                onClick={() => onSelect?.(p.id)}
                data-testid="upcoming-row"
              >
                <span className="fc-upcoming__date">
                  {formatDateShort(p.resolution_at)}
                </span>
                <span className="fc-upcoming__icon" aria-hidden="true">
                  <CategoryIcon category={p.category} size={14} />
                </span>
                <span className="fc-upcoming__title">{p.statement}</span>
                <span className="fc-upcoming__rel">
                  {relativeDays(p.resolution_at)}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <footer className="fc-upcoming__footer">
        <button
          type="button"
          className="fc-link"
          onClick={onViewAll}
        >
          View all upcoming resolutions <ChevronRightIcon size={12} />
        </button>
      </footer>
    </section>
  );
}

export default UpcomingResolutions;
