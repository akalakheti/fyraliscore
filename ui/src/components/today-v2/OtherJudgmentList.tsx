// Right-column list of remaining proposed changes (spec §5.4).
// Compact rows — title + one-line diff + 2-4 metrics + status chip.

import type { DecisionDelta } from "@/api/today-page-types";
import { StatusChip } from "./StatusChip";

interface Props {
  items: DecisionDelta[];
  onOpen: (id: string) => void;
}

export function OtherJudgmentList({ items, onOpen }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="tdv2-panel" data-testid="other-judgment-panel">
      <header className="tdv2-panel__head">
        <h3 className="tdv2-panel__title">Other judgment items</h3>
        <span className="tdv2-panel__count">{items.length}</span>
      </header>
      <div className="tdv2-other-list">
        {items.map((d) => (
          <button
            key={d.id}
            type="button"
            className="tdv2-other-row"
            onClick={() => onOpen(d.id)}
            data-testid={`other-row-${d.id}`}
          >
            <div>
              <div className="tdv2-other-row__title">{d.title}</div>
              {d.summaryLine ? (
                <div className="tdv2-other-row__summary">{d.summaryLine}</div>
              ) : null}
              {d.keyMetrics.length > 0 ? (
                <div className="tdv2-other-row__metrics">
                  {d.keyMetrics.slice(0, 3).map((m) => m.label).join(" · ")}
                </div>
              ) : null}
            </div>
            <div className="tdv2-other-row__chev">
              <StatusChip status={d.status} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
