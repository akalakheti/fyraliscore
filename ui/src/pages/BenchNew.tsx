import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ALL_DIMENSIONS,
  ALL_PROFILES,
  getEstimate,
  listRuns,
  triggerRun,
  type DimensionName,
  type ProfileKind,
} from "@/api/bench-client";

// /bench/new — form to configure and trigger a benchmark run.
// On submit, posts to /v1/bench/runs and navigates to the run detail
// page where the live-progress view takes over.
export default function BenchNew() {
  const navigate = useNavigate();
  const [dimensions, setDimensions] = useState<Set<DimensionName>>(
    new Set(ALL_DIMENSIONS)
  );
  const [profiles, setProfiles] = useState<Set<ProfileKind>>(
    new Set(["cpu", "db", "trace"])
  );
  const [runs, setRuns] = useState(5);
  const [notes, setNotes] = useState("");
  const [estimate, setEstimate] = useState<{ min: number; max: number } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningRunId, setRunningRunId] = useState<string | null>(null);

  // Refresh estimate when form fields change.
  useEffect(() => {
    if (dimensions.size === 0) {
      setEstimate(null);
      return;
    }
    const ctrl = new AbortController();
    getEstimate(
      Array.from(dimensions),
      runs,
      Array.from(profiles),
      ctrl.signal
    )
      .then((est) => setEstimate({ min: est.min_seconds, max: est.max_seconds }))
      .catch(() => setEstimate(null));
    return () => ctrl.abort();
  }, [dimensions, runs, profiles]);

  // Check for running benchmark on mount so we can disable the submit
  // button if one is already in flight.
  useEffect(() => {
    const ctrl = new AbortController();
    listRuns(5, ctrl.signal)
      .then((rs) => {
        const inFlight = rs.find(
          (r) => r.status === "running" || r.status === "queued"
        );
        setRunningRunId(inFlight ? inFlight.id : null);
      })
      .catch(() => {
        /* benign — keep submit enabled */
      });
    return () => ctrl.abort();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dimensions.size === 0) {
      setError("Select at least one dimension.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resp = await triggerRun({
        dimensions: Array.from(dimensions),
        runs,
        profile_kinds: Array.from(profiles),
        baseline_sha: null,
        notes: notes || null,
      });
      if (resp.run_id) {
        navigate(`/bench/runs/${resp.run_id}`);
      } else {
        // Backend scheduled but didn't return id within poll window.
        // Bounce to dashboard which will pick it up.
        navigate("/bench");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const disabled = submitting || !!runningRunId || dimensions.size === 0;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-3 flex items-center gap-3">
          <Link to="/bench" className="font-semibold text-sm">
            ← Bench
          </Link>
          <span className="text-neutral-400">/</span>
          <span className="text-sm">New benchmark</span>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          Start a new benchmark
        </h1>
        <p className="text-sm text-neutral-600 mb-8">
          Configure dimensions, profile capture, and run count. Submitting
          kicks off a background run and navigates you to the live-progress
          view.
        </p>

        {runningRunId ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-6 text-sm text-amber-900">
            <strong>Another benchmark is in progress.</strong> Cancel it
            first, or wait for it to complete.{" "}
            <Link
              to={`/bench/runs/${runningRunId}`}
              className="underline font-medium"
            >
              View progress →
            </Link>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-8">
          <Fieldset
            label="Dimensions"
            help="Which axes to measure. All selected by default."
          >
            <div className="flex flex-wrap gap-2">
              {ALL_DIMENSIONS.map((d) => (
                <Chip
                  key={d}
                  label={d.replace(/_/g, " ")}
                  selected={dimensions.has(d)}
                  onToggle={() => {
                    const next = new Set(dimensions);
                    next.has(d) ? next.delete(d) : next.add(d);
                    setDimensions(next);
                  }}
                />
              ))}
            </div>
          </Fieldset>

          <Fieldset
            label="Profiles to capture"
            help="Profiling adds overhead but is invaluable for diagnosing regressions."
          >
            <div className="flex flex-wrap gap-2">
              {ALL_PROFILES.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  selected={profiles.has(p)}
                  onToggle={() => {
                    const next = new Set(profiles);
                    next.has(p) ? next.delete(p) : next.add(p);
                    setProfiles(next);
                  }}
                />
              ))}
            </div>
          </Fieldset>

          <Fieldset
            label="Runs per scenario (N)"
            help="Higher N tightens the percentiles but extends wall-clock."
          >
            <input
              type="number"
              min={1}
              max={20}
              value={runs}
              onChange={(e) =>
                setRuns(Math.max(1, Math.min(20, Number(e.target.value) || 5)))
              }
              className="w-24 rounded border border-neutral-300 px-3 py-1.5 text-sm"
            />
          </Fieldset>

          <Fieldset
            label="Notes (optional)"
            help="A short description of what you're testing. Visible on the run detail page."
          >
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='e.g. "HNSW ef_search=80 experiment"'
              className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
            />
          </Fieldset>

          {estimate ? (
            <div className="rounded-md bg-neutral-100 px-4 py-3 text-sm">
              Estimated wall-clock:{" "}
              <span className="font-medium tabular-nums">
                {formatSeconds(estimate.min)}–{formatSeconds(estimate.max)}
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={disabled}
              className={
                "rounded-md px-5 py-2 text-sm font-medium transition-colors " +
                (disabled
                  ? "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  : "bg-neutral-900 text-white hover:bg-neutral-700")
              }
            >
              {submitting ? "Starting…" : "Start benchmark"}
            </button>
            <Link
              to="/bench"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function Fieldset({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-medium mb-1">{label}</div>
      {help ? <div className="text-xs text-neutral-500 mb-2">{help}</div> : null}
      {children}
    </div>
  );
}

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
        (selected
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-500")
      }
    >
      {label}
    </button>
  );
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (rem === 0) return `${mins}m`;
  return `${mins}m ${rem}s`;
}
