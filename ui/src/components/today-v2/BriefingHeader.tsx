// Briefing header — spec §4.4.
//
//   Today
//   Fyralis reviewed the company since your last session.
//   98 signals processed · 91 absorbed · 7 need your judgment.
//   May 18, 12:03 PM
//
// "Absorbed" reads in restrained moss. "Need your judgment" reads in
// restrained garnet. Numbers are bold. No metric tile bar.

import type { TodaySummary } from "@/api/today-page-types";

interface Props {
  summary: TodaySummary;
  generatedAt: string;
}

function formatStamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function BriefingHeader({ summary, generatedAt }: Props) {
  const need = summary.needJudgment;
  const absorbed = summary.signalsAbsorbed;
  const processed = summary.signalsProcessed;

  return (
    <header className="tdv2-header" data-testid="briefing-header">
      <h1 className="tdv2-header__title">Today</h1>
      <p className="tdv2-header__briefing">
        Fyralis reviewed the company since your last session.
      </p>
      <p className="tdv2-header__receipt">
        <strong>{processed}</strong> signals processed
        <span aria-hidden="true"> · </span>
        <span className="tdv2-em-absorbed">
          <strong>{absorbed}</strong> absorbed
        </span>
        <span aria-hidden="true"> · </span>
        {need > 0 ? (
          <span className="tdv2-em-judgment">
            <strong>{need}</strong> need your judgment
          </span>
        ) : (
          <span className="tdv2-em-absorbed">Nothing needs your judgment</span>
        )}
      </p>
      <p className="tdv2-header__stamp">{formatStamp(generatedAt)}</p>
    </header>
  );
}
