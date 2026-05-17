// Briefing header — spec §5.1. Re-entry statement.
//
// "Fyralis reviewed the company since your last session.
//  98 signals processed. 94 absorbed. 4 need your judgment.
//  You're up to date. 8:42 AM, May 15."

import type { TodaySummary } from "@/api/today-page-types";

interface Props {
  summary: TodaySummary;
  generatedAt: string;
  onAsk?: () => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function BriefingHeader({ summary, generatedAt, onAsk }: Props) {
  const upToDate = summary.needJudgment === 0;
  return (
    <header className="tdv2-header" data-testid="briefing-header">
      <div className="tdv2-header__title-wrap">
        <h1 className="tdv2-header__title">Today</h1>
        <p className="tdv2-header__briefing">
          Fyralis reviewed the company since your last session.{" "}
          <strong>{summary.signalsProcessed}</strong> signals processed.{" "}
          <span className="tdv2-em-absorbed">{summary.signalsAbsorbed} absorbed</span>.{" "}
          {summary.needJudgment > 0 ? (
            <span className="tdv2-em-judgment">{summary.needJudgment} need your judgment.</span>
          ) : (
            <span className="tdv2-em-absorbed">Nothing needs your judgment.</span>
          )}
        </p>
        <p className="tdv2-header__since">
          {upToDate ? "You're up to date. " : ""}
          {formatTime(generatedAt)}
        </p>
      </div>
      <div className="tdv2-header__controls">
        {onAsk ? (
          <button
            type="button"
            className="tdv2-ask-btn"
            onClick={onAsk}
            data-testid="briefing-ask-btn"
          >
            Ask Fyralis
          </button>
        ) : null}
      </div>
    </header>
  );
}
