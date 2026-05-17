// Summary strip — spec §5.2. Renders the page's scope-of-work line:
// signals processed / absorbed, model updates, need judgment, exposure.

import type { TodaySummary } from "@/api/today-page-types";

interface Props {
  summary: TodaySummary;
  compressed?: boolean;
}

export function SummaryStrip({ summary, compressed = false }: Props) {
  const cells = [
    { label: "Signals processed", value: summary.signalsProcessed },
    { label: "Absorbed", value: summary.signalsAbsorbed },
    { label: "Model updates", value: summary.modelUpdates },
    { label: "Need judgment", value: summary.needJudgment },
    {
      label: "Exposure",
      value: summary.exposure?.formatted ?? "—",
    },
  ];
  return (
    <div
      className={`tdv2-summary${compressed ? " tdv2-summary--compressed" : ""}`}
      data-testid="today-summary-strip"
    >
      {cells.map((c) => (
        <div key={c.label} className="tdv2-summary__cell">
          <div className="tdv2-summary__value">{c.value}</div>
          <div className="tdv2-summary__label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
