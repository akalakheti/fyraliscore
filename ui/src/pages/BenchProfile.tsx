import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { profileArtifactUrl, type ProfileKind } from "@/api/bench-client";
import { FlameGraph, type SpeedscopeDoc } from "@/components/FlameGraph";
import { QueryPlan, type DBPlansDoc } from "@/components/QueryPlan";
import { TraceTimeline, type ChromeTraceDoc } from "@/components/TraceTimeline";
import { getAuthHeader } from "@/api/auth";

// /bench/runs/:runId/profile/:kind — viewer for a captured profile.
// Renders one of three components depending on the kind: flame graph,
// SQL query plan tree, or chrome-trace Gantt timeline. The memory
// profile uses a simple JSON dump for now.
export default function BenchProfile() {
  const { runId, kind } = useParams<{ runId: string; kind: ProfileKind }>();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !kind) return;
    const url = profileArtifactUrl(runId, kind);
    fetch(url, { headers: { ...getAuthHeader() } })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [runId, kind]);

  if (!runId || !kind) return <div className="p-8">Missing params.</div>;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center gap-3">
          <Link to="/bench" className="font-semibold text-sm">
            ← Bench
          </Link>
          <span className="text-neutral-400">/</span>
          <Link
            to={`/bench/runs/${runId}`}
            className="text-sm font-mono"
          >
            {runId.slice(0, 8)}…
          </Link>
          <span className="text-neutral-400">/</span>
          <span className="text-sm capitalize">{kind} profile</span>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-6 capitalize">
          {kind} profile
        </h1>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Failed to load profile artifact: {error}
          </div>
        ) : !data ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : kind === "cpu" ? (
          <FlameGraph doc={data as SpeedscopeDoc} />
        ) : kind === "db" ? (
          <QueryPlan doc={data as DBPlansDoc} />
        ) : kind === "trace" ? (
          <TraceTimeline doc={data as ChromeTraceDoc} />
        ) : kind === "memory" ? (
          <MemoryView doc={data as MemoryDoc} />
        ) : (
          <div className="text-sm text-neutral-500">Unknown profile kind.</div>
        )}
      </main>
    </div>
  );
}

interface MemoryDoc {
  top_allocators?: {
    size: number;
    size_diff: number;
    count: number;
    count_diff: number;
    traceback: string[];
  }[];
}

function MemoryView({ doc }: { doc: MemoryDoc }) {
  const rows = doc.top_allocators ?? [];
  if (!rows.length)
    return (
      <div className="text-sm text-neutral-500">
        No allocator deltas captured. The memory profile may have been disabled
        or had no allocations to compare.
      </div>
    );
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="text-right px-3 py-2 font-medium">Δ size</th>
            <th className="text-right px-3 py-2 font-medium">Δ count</th>
            <th className="text-left px-3 py-2 font-medium">Traceback</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="hover:bg-neutral-50">
              <td className="px-3 py-2 text-right tabular-nums font-mono text-xs">
                {(r.size_diff / 1024).toFixed(1)} KiB
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-xs">
                {r.count_diff > 0 ? `+${r.count_diff}` : r.count_diff}
              </td>
              <td className="px-3 py-2 font-mono text-[11px]">
                {r.traceback.map((line, j) => (
                  <div key={j}>{line}</div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
