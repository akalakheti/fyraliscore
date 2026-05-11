import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRuns, type BenchRunSummary, type RunStatus } from "@/api/bench-client";

// /bench — dashboard for the benchmarking system.
// Shows: top action ("+ New benchmark"), a live "running now" strip,
// KPI summary, and a recent-runs table that auto-refreshes every 3s
// while any run is in progress (WebSocket streaming arrives in the
// live-progress build step).
export default function Bench() {
  const [runs, setRuns] = useState<BenchRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll while any run is in-flight; otherwise refetch every 15s.
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    async function load() {
      try {
        const data = await listRuns(20, ctrl.signal);
        if (!cancelled) {
          setRuns(data);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }
    load();
    const intervalId = setInterval(load, 3000);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(intervalId);
    };
  }, []);

  const running = runs.find((r) => r.status === "running" || r.status === "queued");
  const totalRegressions = runs.reduce((acc, r) => acc + (r.regressions || 0), 0);
  const totalImprovements = runs.reduce((acc, r) => acc + (r.improvements || 0), 0);
  const completedCount = runs.filter((r) => r.status === "completed").length;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <BenchTopNav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <header className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Bench</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Multi-dimensional performance, quality, and cost benchmarking.
              Trigger runs, watch live progress, and inspect regressions.
            </p>
          </div>
          <Link
            to="/bench/new"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            + New benchmark
          </Link>
        </header>

        {running ? <RunningNow run={running} /> : null}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <KPI label="Completed runs" value={completedCount} tone="neutral" />
          <KPI
            label="Regressions across all runs"
            value={totalRegressions}
            tone={totalRegressions > 0 ? "bad" : "good"}
          />
          <KPI
            label="Improvements across all runs"
            value={totalImprovements}
            tone={totalImprovements > 0 ? "good" : "neutral"}
          />
        </section>

        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">
            Recent runs
          </h2>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Failed to load runs: {error}
            </div>
          ) : loading ? (
            <div className="text-sm text-neutral-500">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-300 px-6 py-12 text-center">
              <p className="text-sm text-neutral-600">No runs yet.</p>
              <Link
                to="/bench/new"
                className="mt-3 inline-block text-sm font-medium text-neutral-900 underline"
              >
                Trigger your first benchmark →
              </Link>
            </div>
          ) : (
            <RunsTable runs={runs} />
          )}
        </section>
      </main>
    </div>
  );
}

function BenchTopNav() {
  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center gap-6">
        <Link to="/" className="font-semibold text-sm">
          ← Fyraliscore
        </Link>
        <span className="text-neutral-400">/</span>
        <Link to="/bench" className="text-sm font-medium">
          Bench
        </Link>
        <span className="text-neutral-400">·</span>
        <Link to="/bench/trends" className="text-sm text-neutral-600 hover:text-neutral-900">
          Trends
        </Link>
        <Link to="/bench/baselines" className="text-sm text-neutral-600 hover:text-neutral-900">
          Baselines
        </Link>
      </div>
    </nav>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "neutral";
}) {
  const toneClasses: Record<string, string> = {
    good: "bg-emerald-50 border-emerald-200 text-emerald-900",
    bad: "bg-red-50 border-red-200 text-red-900",
    neutral: "bg-white border-neutral-200 text-neutral-900",
  };
  return (
    <div className={`rounded-md border px-5 py-4 ${toneClasses[tone]}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RunningNow({ run }: { run: BenchRunSummary }) {
  return (
    <Link
      to={`/bench/runs/${run.id}`}
      className="block mb-6 rounded-md border border-blue-200 bg-blue-50 px-5 py-4 hover:bg-blue-100 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-blue-900">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          Running now
        </span>
        <span className="text-xs text-blue-900 tabular-nums">
          {run.progress_pct}%
        </span>
      </div>
      <div className="text-sm font-medium text-blue-950">
        {run.current_stage ?? "Starting…"}
      </div>
      <div className="mt-2 w-full bg-blue-200 rounded h-1.5 overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all"
          style={{ width: `${Math.max(2, run.progress_pct)}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-blue-900/80">
        Triggered by {run.triggered_by} · {run.dimensions.join(", ")} ·
        click to view live progress →
      </div>
    </Link>
  );
}

function RunsTable({ runs }: { runs: BenchRunSummary[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Branch / SHA</th>
            <th className="text-left px-4 py-2 font-medium">Dimensions</th>
            <th className="text-right px-4 py-2 font-medium">Regressions</th>
            <th className="text-right px-4 py-2 font-medium">Improvements</th>
            <th className="text-left px-4 py-2 font-medium">Started</th>
            <th className="text-left px-4 py-2 font-medium">Triggered by</th>
            <th className="text-right px-4 py-2 font-medium">View</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {runs.map((r) => (
            <tr key={r.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2">
                <StatusChip status={r.status} />
              </td>
              <td className="px-4 py-2 font-mono text-xs">
                <div>{r.git_branch}</div>
                <div className="text-neutral-500">
                  {r.git_sha.slice(0, 10)}
                  {r.git_dirty ? " (dirty)" : ""}
                </div>
              </td>
              <td className="px-4 py-2 text-xs">
                {r.dimensions.map((d) => (
                  <span
                    key={d}
                    className="inline-block mr-1 mb-1 px-2 py-0.5 bg-neutral-100 rounded"
                  >
                    {d}
                  </span>
                ))}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                <span
                  className={
                    r.regressions > 0
                      ? "text-red-700 font-semibold"
                      : "text-neutral-400"
                  }
                >
                  {r.regressions}
                </span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                <span
                  className={
                    r.improvements > 0
                      ? "text-emerald-700"
                      : "text-neutral-400"
                  }
                >
                  {r.improvements}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-neutral-600">
                {formatTime(r.started_at)}
              </td>
              <td className="px-4 py-2 text-xs text-neutral-600">
                {r.triggered_by}
              </td>
              <td className="px-4 py-2 text-right">
                <Link
                  to={`/bench/runs/${r.id}`}
                  className="text-neutral-900 underline text-xs"
                >
                  view
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusChip({ status }: { status: RunStatus }) {
  const map: Record<RunStatus, { label: string; cls: string }> = {
    queued: {
      label: "queued",
      cls: "bg-neutral-100 text-neutral-700",
    },
    running: {
      label: "● running",
      cls: "bg-blue-100 text-blue-800",
    },
    completed: {
      label: "✓ completed",
      cls: "bg-emerald-100 text-emerald-800",
    },
    failed: { label: "✗ failed", cls: "bg-red-100 text-red-800" },
    cancelled: {
      label: "cancelled",
      cls: "bg-neutral-200 text-neutral-700",
    },
  };
  const v = map[status];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 60_000) return "just now";
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
