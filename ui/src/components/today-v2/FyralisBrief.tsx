// Fyralis Brief — spec §4.5.
//
// The emotional and informational anchor of Briefing Mode. One human
// synthesis sentence + a two-column grid: "What changed" (3–5 short
// bullets, can include direction) and "Handled without you" (signals
// absorbed, model updates applied, items under monitoring), with a
// "See all activity →" link at the bottom.
//
// Synthesis copy comes from `summary.reassuranceCopy` when present.
// "What changed" entries are derived from the visible judgment items'
// summary lines; that keeps the section truthful when the API does not
// yet ship a dedicated `whatChanged` payload.

import type {
  DecisionDelta,
  HandledWithoutYouSummary,
} from "@/api/today-page-types";

interface Props {
  synthesis?: string;
  whatChanged: WhatChangedItem[];
  handled: HandledWithoutYouSummary;
}

export interface WhatChangedItem {
  text: string;
  direction?: "up" | "down" | "neutral";
}

export function FyralisBrief({ synthesis, whatChanged, handled }: Props) {
  return (
    <section className="tdv2-brief" data-testid="fyralis-brief">
      {synthesis ? (
        <p className="tdv2-brief__synthesis">{synthesis}</p>
      ) : null}
      <div className="tdv2-brief__grid">
        <div className="tdv2-brief__col">
          <h3 className="tdv2-brief__heading">What changed</h3>
          {whatChanged.length > 0 ? (
            <ul className="tdv2-brief__list">
              {whatChanged.slice(0, 5).map((c, i) => (
                <li key={i} className="tdv2-brief__list-item">
                  <DirectionGlyph dir={c.direction ?? "neutral"} />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tdv2-brief__empty">
              No material changes since your last session.
            </p>
          )}
        </div>
        <div className="tdv2-brief__col">
          <h3 className="tdv2-brief__heading">Handled without you</h3>
          <ul className="tdv2-brief__list">
            <li className="tdv2-brief__stat">
              <span className="tdv2-brief__stat-value">{handled.signalsAbsorbed}</span>
              <span>signals absorbed</span>
            </li>
            <li className="tdv2-brief__stat">
              <span className="tdv2-brief__stat-value">{handled.modelUpdatesApplied}</span>
              <span>model updates applied</span>
            </li>
            <li className="tdv2-brief__stat">
              <span className="tdv2-brief__stat-value">{handled.itemsUnderMonitoring}</span>
              <span>items under monitoring</span>
            </li>
            {handled.delegatedChanges > 0 ? (
              <li className="tdv2-brief__stat">
                <span className="tdv2-brief__stat-value">{handled.delegatedChanges}</span>
                <span>delegated</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      <a className="tdv2-brief__link" href="/ledger">
        See all activity →
      </a>
    </section>
  );
}

// Derive a "what changed" list from the visible judgment queue. Each
// item's summaryLine is short ("Watch → Critical") and direction can
// be inferred from the first changed-state severity.
export function deriveWhatChanged(deltas: DecisionDelta[]): WhatChangedItem[] {
  const items: WhatChangedItem[] = [];
  for (const d of deltas) {
    const proposed = d.proposedState.find(
      (f) => f.severity === "critical" || f.severity === "watch" || f.severity === "positive",
    );
    const dir: WhatChangedItem["direction"] =
      proposed?.severity === "positive"
        ? "down"
        : proposed?.severity === "critical"
          ? "up"
          : proposed?.severity === "watch"
            ? "up"
            : "neutral";
    const text = shorten(d.title);
    items.push({ text, direction: dir });
    if (items.length >= 5) break;
  }
  return items;
}

function shorten(s: string): string {
  // Trim to one short line — strip trailing "— action" hints so the
  // bullet reads as a state change, not an instruction.
  const stripped = s.replace(/ — .*$/, "").replace(/ - .*$/, "");
  if (stripped.length <= 60) return stripped;
  return stripped.slice(0, 57).trimEnd() + "…";
}

function DirectionGlyph({ dir }: { dir: "up" | "down" | "neutral" }) {
  if (dir === "up") {
    return (
      <span className="tdv2-brief__dir tdv2-brief__dir--up" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8.5V2M2.5 4.5L5 2l2.5 2.5" />
        </svg>
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span className="tdv2-brief__dir tdv2-brief__dir--down" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 1.5V8M2.5 5.5L5 8l2.5-2.5" />
        </svg>
      </span>
    );
  }
  return (
    <span className="tdv2-brief__dir tdv2-brief__dir--neutral" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 5h6" />
      </svg>
    </span>
  );
}
