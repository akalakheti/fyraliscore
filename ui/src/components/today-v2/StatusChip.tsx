// Status chip for the 9 spec statuses. Each status maps to a human
// label + a color class. Spec §16.4 — chips carry both color and text
// so color isn't the sole indicator.

import type { DeltaStatus } from "@/api/today-page-types";

const LABELS: Record<DeltaStatus, string> = {
  needs_authority:      "Needs your authority",
  delegatable:          "Delegatable",
  monitoring:           "Monitoring",
  contested:            "Contested",
  accepted:             "Accepted",
  delegated:            "Delegated",
  correction_submitted: "Correction submitted",
  archived:             "Archived",
  failed_apply:         "Apply failed",
};

export function StatusChip({ status }: { status: DeltaStatus }) {
  return (
    <span
      className={`tdv2-status-chip tdv2-status-chip--${status}`}
      data-testid={`status-chip-${status}`}
    >
      {LABELS[status]}
    </span>
  );
}

export function statusLabel(status: DeltaStatus): string {
  return LABELS[status];
}
