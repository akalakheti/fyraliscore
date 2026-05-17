// Current → Proposed diff block. Used both in Primary Judgment (small
// version, only 1–3 rows) and Focused Review (full table).
//
// Severity tinting on the "to" cell is driven by the field's severity.

import type { DeltaField } from "@/api/today-page-types";

interface Props {
  current: DeltaField[];
  proposed: DeltaField[];
  showHeader?: boolean;
  maxRows?: number;
}

export function MiniDiff({
  current,
  proposed,
  showHeader = false,
  maxRows,
}: Props) {
  const byKey = new Map<string, { from?: DeltaField; to?: DeltaField; label: string }>();
  for (const f of current) {
    byKey.set(f.key, { from: f, label: f.label });
  }
  for (const f of proposed) {
    const prev = byKey.get(f.key);
    byKey.set(f.key, { from: prev?.from, to: f, label: prev?.label ?? f.label });
  }
  const rows = Array.from(byKey.values()).filter(
    (r) => (r.from?.value ?? "") !== (r.to?.value ?? ""),
  );
  const visible = maxRows != null ? rows.slice(0, maxRows) : rows;
  if (visible.length === 0) return null;
  return (
    <div className="tdv2-diff" role="table" data-testid="mini-diff">
      {showHeader ? (
        <div className="tdv2-diff__row" role="row">
          <div className="tdv2-diff__cell tdv2-diff__header" role="columnheader">Field</div>
          <div className="tdv2-diff__cell tdv2-diff__header" role="columnheader">Current</div>
          <div className="tdv2-diff__cell tdv2-diff__header" role="columnheader">Proposed</div>
        </div>
      ) : null}
      {visible.map((r) => (
        <div key={r.label} className="tdv2-diff__row" role="row">
          <div className="tdv2-diff__cell tdv2-diff__field" role="cell">{r.label}</div>
          <div className="tdv2-diff__cell tdv2-diff__from" role="cell">
            {r.from?.value ?? "—"}
          </div>
          <div
            className={`tdv2-diff__cell tdv2-diff__to${
              r.to?.severity ? ` tdv2-diff__to--${r.to.severity}` : ""
            }`}
            role="cell"
          >
            <span className="tdv2-arrow" aria-hidden="true">→</span>
            {r.to?.value ?? "Removed"}
          </div>
        </div>
      ))}
    </div>
  );
}
