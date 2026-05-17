import { useEffect, useRef, useState } from "react";
import type {
  CreateScenarioBody,
  ForecastCategory,
} from "@/api/forecasts-types";
import { CATEGORY_LABEL } from "./format";

export interface NewScenarioDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: CreateScenarioBody) => Promise<void> | void;
}

const CATEGORIES: ForecastCategory[] = [
  "customer_risk",
  "capacity",
  "delivery",
  "strategy",
  "decision",
  "pricing",
  "partner",
];

function defaultResolution(): string {
  const t = new Date();
  t.setDate(t.getDate() + 14);
  t.setHours(17, 0, 0, 0);
  // ISO without seconds for datetime-local input.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export function NewScenarioDialog({
  open,
  onClose,
  onSubmit,
}: NewScenarioDialogProps) {
  const [statement, setStatement] = useState("");
  const [rationale, setRationale] = useState("");
  const [category, setCategory] = useState<ForecastCategory>("strategy");
  const [confidence, setConfidence] = useState(0.6);
  const [resolutionAt, setResolutionAt] = useState(defaultResolution);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setStatement("");
      setRationale("");
      setCategory("strategy");
      setConfidence(0.6);
      setResolutionAt(defaultResolution());
      setError(null);
      setSubmitting(false);
      // Focus on next tick so the dialog has mounted.
      window.setTimeout(() => firstInputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement.trim()) {
      setError("Statement is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const iso = new Date(resolutionAt).toISOString();
      await onSubmit({
        statement: statement.trim(),
        rationale: rationale.trim() || undefined,
        category,
        confidence,
        resolution_at: iso,
      });
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to submit scenario.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  return (
    <div className="fc-dialog__scrim" data-testid="new-scenario-scrim">
      <div
        className="fc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-dialog-title"
        data-testid="new-scenario-dialog"
      >
        <header className="fc-dialog__header">
          <h2 id="fc-dialog-title" className="fc-dialog__title">
            New scenario
          </h2>
          <button
            type="button"
            className="fc-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form className="fc-dialog__body" onSubmit={handleSubmit}>
          <label className="fc-field">
            <span className="fc-field__label">Statement</span>
            <input
              ref={firstInputRef}
              type="text"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="e.g. Beacon renewal at risk"
              data-testid="new-scenario-statement"
              required
            />
          </label>
          <label className="fc-field">
            <span className="fc-field__label">Rationale</span>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={2}
              placeholder="One sentence explaining the leading signal"
              data-testid="new-scenario-rationale"
            />
          </label>
          <div className="fc-field fc-field--row">
            <label className="fc-field">
              <span className="fc-field__label">Category</span>
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ForecastCategory)
                }
                data-testid="new-scenario-category"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="fc-field">
              <span className="fc-field__label">
                Confidence ({Math.round(confidence * 100)}%)
              </span>
              <input
                type="range"
                min={0.5}
                max={0.99}
                step={0.01}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                data-testid="new-scenario-confidence"
              />
            </label>
          </div>
          <label className="fc-field">
            <span className="fc-field__label">Resolution by</span>
            <input
              type="datetime-local"
              value={resolutionAt}
              onChange={(e) => setResolutionAt(e.target.value)}
              data-testid="new-scenario-resolution"
              required
            />
          </label>
          {error ? (
            <div className="fc-dialog__error" role="alert">
              {error}
            </div>
          ) : null}
          <footer className="fc-dialog__footer">
            <button
              type="button"
              className="fc-btn fc-btn--ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fc-btn fc-btn--primary"
              disabled={submitting}
              data-testid="new-scenario-submit"
            >
              {submitting ? "Creating…" : "Create scenario"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default NewScenarioDialog;
