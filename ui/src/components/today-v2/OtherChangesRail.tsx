// Bottom rail in Focused Review Mode (spec §3.2). Compact switcher
// for the remaining proposed changes.

import type { DecisionDelta } from "@/api/today-page-types";

interface Props {
  items: DecisionDelta[];
  onOpen: (id: string) => void;
  currentId: string;
}

export function OtherChangesRail({ items, onOpen, currentId }: Props) {
  const others = items.filter((d) => d.id !== currentId);
  if (others.length === 0) return null;
  return (
    <section data-testid="other-changes-rail" style={{ marginTop: "var(--space-6)" }}>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "var(--space-3)" }}>
        Other changes
      </div>
      <div className="tdv2-rail">
        {others.map((d) => (
          <button
            key={d.id}
            type="button"
            className="tdv2-rail__item"
            onClick={() => onOpen(d.id)}
            data-testid={`rail-item-${d.id}`}
          >
            <div className="tdv2-rail__item-status">{d.status.replace(/_/g, " ")}</div>
            <div className="tdv2-rail__item-title">{d.title}</div>
            <div className="tdv2-rail__item-summary">{d.summaryLine}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
