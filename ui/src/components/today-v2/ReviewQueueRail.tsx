// Local Review Queue Rail — spec §7.
//
// Visually quieter than the global sidebar. Lets the user move
// quickly through judgment items while the focused review sheet
// dominates the page. Switching does NOT leave Review Mode.

import type {
  DecisionDelta,
  HandledWithoutYouSummary,
} from "@/api/today-page-types";

interface Props {
  items: DecisionDelta[];
  selectedId: string;
  handled: HandledWithoutYouSummary;
  onSelect: (id: string) => void;
}

function confPct(c?: number | null): string | null {
  if (c == null) return null;
  return `${Math.round(c * 100)}% confidence`;
}

function statusTone(status: DecisionDelta["status"]): string {
  if (status === "needs_authority") return "authority";
  if (status === "delegatable") return "delegate";
  if (status === "monitoring") return "monitor";
  if (status === "contested" || status === "correction_submitted") return "contest";
  return "neutral";
}

function statusLabel(status: DecisionDelta["status"]): string {
  switch (status) {
    case "needs_authority": return "Needs authority";
    case "delegatable":     return "Delegatable";
    case "monitoring":      return "Monitoring";
    case "contested":       return "Contested";
    case "correction_submitted": return "Correction submitted";
    default:                return status;
  }
}

export function ReviewQueueRail({ items, selectedId, handled, onSelect }: Props) {
  const selectedIdx = items.findIndex((d) => d.id === selectedId);
  const primary = items[0];
  const others = items.slice(1);

  return (
    <aside
      className="tdv2-rail"
      data-testid="review-rail"
      aria-label="Review queue"
    >
      <div className="tdv2-rail__head">
        <span className="tdv2-rail__position">
          Reviewing{" "}
          <strong>
            {selectedIdx < 0 ? 1 : selectedIdx + 1} of {items.length}
          </strong>
        </span>
      </div>

      {primary ? (
        <div className="tdv2-rail__group">
          <h4 className="tdv2-rail__group-label">Primary judgment</h4>
          <RailRow
            delta={primary}
            selected={primary.id === selectedId}
            onSelect={() => onSelect(primary.id)}
            primary
          />
        </div>
      ) : null}

      {others.length > 0 ? (
        <div className="tdv2-rail__group">
          <h4 className="tdv2-rail__group-label">
            Other items needing your judgment
          </h4>
          <ul className="tdv2-rail__list">
            {others.map((d) => (
              <li key={d.id}>
                <RailRow
                  delta={d}
                  selected={d.id === selectedId}
                  onSelect={() => onSelect(d.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tdv2-rail__group tdv2-rail__group--handled">
        <h4 className="tdv2-rail__group-label">Handled without you</h4>
        <ul className="tdv2-rail__stats">
          <li>
            <span className="tdv2-rail__stat-value">{handled.signalsAbsorbed}</span>
            <span>absorbed</span>
          </li>
          <li>
            <span className="tdv2-rail__stat-value">{handled.modelUpdatesApplied}</span>
            <span>updates</span>
          </li>
          <li>
            <span className="tdv2-rail__stat-value">{handled.itemsUnderMonitoring}</span>
            <span>monitoring</span>
          </li>
        </ul>
      </div>
    </aside>
  );
}

function RailRow({
  delta,
  selected,
  onSelect,
  primary = false,
}: {
  delta: DecisionDelta;
  selected: boolean;
  onSelect: () => void;
  primary?: boolean;
}) {
  const tone = statusTone(delta.status);
  const conf = confPct(delta.confidence);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      data-testid={`rail-row-${delta.id}`}
      className={[
        "tdv2-rail__row",
        `tdv2-rail__row--${tone}`,
        selected ? "tdv2-rail__row--selected" : "",
        primary ? "tdv2-rail__row--primary" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="tdv2-rail__indicator" aria-hidden="true" />
      <span className="tdv2-rail__body">
        <span className="tdv2-rail__title">{delta.title}</span>
        <span className="tdv2-rail__state">
          {primary ? statusLabel(delta.status) : delta.summaryLine || statusLabel(delta.status)}
        </span>
        {conf ? <span className="tdv2-rail__meta">{conf}</span> : null}
      </span>
    </button>
  );
}
