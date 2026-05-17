// "Handled without you" panel — spec §5.5. The page's emotional value
// statement. Soft moss accents, no aggressive CTA.

import type { HandledWithoutYouSummary } from "@/api/today-page-types";

interface Props {
  summary: HandledWithoutYouSummary;
}

export function HandledWithoutYouPanel({ summary }: Props) {
  const total =
    summary.signalsAbsorbed +
    summary.modelUpdatesApplied +
    summary.itemsUnderMonitoring +
    summary.delegatedChanges +
    summary.contestedChanges;
  if (total === 0) return null;

  return (
    <section
      className="tdv2-panel tdv2-handled"
      data-testid="handled-without-you-panel"
    >
      <header className="tdv2-panel__head">
        <h3 className="tdv2-panel__title tdv2-handled__title">Handled without you</h3>
      </header>
      <ul className="tdv2-handled__list">
        <li className="tdv2-handled__item">
          <span className="tdv2-handled__value">{summary.signalsAbsorbed}</span>
          <span>signals absorbed</span>
        </li>
        <li className="tdv2-handled__item">
          <span className="tdv2-handled__value">{summary.modelUpdatesApplied}</span>
          <span>model updates applied</span>
        </li>
        <li className="tdv2-handled__item">
          <span className="tdv2-handled__value">{summary.itemsUnderMonitoring}</span>
          <span>items under monitoring</span>
        </li>
        <li className="tdv2-handled__item">
          <span className="tdv2-handled__value">{summary.delegatedChanges}</span>
          <span>delegated change{summary.delegatedChanges === 1 ? "" : "s"}</span>
        </li>
        <li className="tdv2-handled__item">
          <span className="tdv2-handled__value">{summary.contestedChanges}</span>
          <span>contested change{summary.contestedChanges === 1 ? "" : "s"}</span>
        </li>
      </ul>
      {summary.reassuranceCopy ? (
        <p className="tdv2-handled__reassurance">{summary.reassuranceCopy}</p>
      ) : null}
      <a className="tdv2-handled__cta" href="/model">
        See what changed in Model →
      </a>
    </section>
  );
}
