// Horizontal confidence gradient bar with Low/Medium/High markers
// underneath. The thumb position is the confidence value.

export interface ConfidenceBarProps {
  value: number;
  showNumber?: boolean;
}

export function ConfidenceBar({ value, showNumber = true }: ConfidenceBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="fc-confbar" role="group" aria-label="Confidence">
      {showNumber ? (
        <div className="fc-confbar__lead">
          <span className="fc-confbar__value">{pct}% confidence</span>
        </div>
      ) : null}
      <div className="fc-confbar__track" aria-hidden="true">
        <div className="fc-confbar__gradient" />
        <div
          className="fc-confbar__thumb"
          style={{ left: `${pct}%` }}
          data-testid="confidence-thumb"
        />
      </div>
      <div className="fc-confbar__markers">
        <span>Low</span>
        <span>Medium</span>
        <span>High</span>
      </div>
    </div>
  );
}

export default ConfidenceBar;
