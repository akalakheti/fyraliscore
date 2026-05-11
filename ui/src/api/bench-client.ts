// HTTP client for the /bench surface — backed by services.gateway.bench_routes.
// Matches the pattern of history-client.ts: a small request<T> wrapper +
// named exports per endpoint. The WebSocket subscription helper lives
// in bench-stream.ts (added in the live-progress build step).

import { ApiError } from "./client";
import { getAuthHeader, handleAuthFailure } from "./auth";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type Verdict = "ok" | "regression" | "improvement";

export type DimensionName =
  | "latency"
  | "throughput"
  | "retrieval_quality"
  | "reasoning_quality"
  | "cost";

export type ProfileKind = "cpu" | "db" | "trace" | "memory";

export const ALL_DIMENSIONS: DimensionName[] = [
  "latency",
  "throughput",
  "retrieval_quality",
  "reasoning_quality",
  "cost",
];

export const ALL_PROFILES: ProfileKind[] = ["cpu", "db", "trace", "memory"];

export interface BenchRunSummary {
  id: string;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  git_sha: string;
  git_branch: string;
  git_dirty: boolean;
  baseline_sha: string | null;
  dimensions: string[];
  profile_kinds: string[];
  n_runs: number;
  triggered_by: string;
  current_stage: string | null;
  progress_pct: number;
  regressions: number;
  improvements: number;
  error: string | null;
  notes: string | null;
}

export interface BenchMetric {
  dimension: string;
  metric: string;
  value: number;
  baseline: number | null;
  delta_abs: number | null;
  delta_pct: number | null;
  threshold: number | null;
  verdict: Verdict;
}

export interface ProfileArtifactSummary {
  kind: ProfileKind;
  artifact_path: string;
  summary: Record<string, unknown> | null;
}

export interface BenchRunDetail {
  run: BenchRunSummary;
  metrics: BenchMetric[];
  profiles: ProfileArtifactSummary[];
}

export interface TriggerRunRequest {
  dimensions: DimensionName[];
  runs: number;
  profile_kinds: ProfileKind[];
  baseline_sha: string | null;
  notes: string | null;
}

export interface EstimateResponse {
  min_seconds: number;
  max_seconds: number;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...getAuthHeader(),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401) handleAuthFailure();
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail += ` — ${body.detail}`;
      if (body?.error) detail += ` — ${body.error}`;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------

export async function listRuns(
  limit = 20,
  signal?: AbortSignal
): Promise<BenchRunSummary[]> {
  const res = await request<{ runs: BenchRunSummary[] }>(
    `/v1/bench/runs?limit=${encodeURIComponent(limit)}`,
    undefined,
    signal
  );
  return res.runs;
}

export function getRun(
  runId: string,
  signal?: AbortSignal
): Promise<BenchRunDetail> {
  return request<BenchRunDetail>(
    `/v1/bench/runs/${encodeURIComponent(runId)}`,
    undefined,
    signal
  );
}

export function getEstimate(
  dimensions: DimensionName[],
  runs: number,
  profileKinds: ProfileKind[],
  signal?: AbortSignal
): Promise<EstimateResponse> {
  const qs = new URLSearchParams({
    dimensions: dimensions.join(","),
    runs: String(runs),
    profile: profileKinds.join(","),
  });
  return request<EstimateResponse>(
    `/v1/bench/estimate?${qs.toString()}`,
    undefined,
    signal
  );
}

export interface TrendPoint {
  run_id: string;
  started_at: string;
  git_sha: string;
  git_branch: string;
  value: number;
  baseline: number | null;
  delta_pct: number | null;
  delta_abs: number | null;
  threshold: number | null;
  verdict: Verdict;
}

export async function getTrends(
  dimension: string,
  metric: string,
  n = 50,
  signal?: AbortSignal
): Promise<TrendPoint[]> {
  const qs = new URLSearchParams({
    dimension,
    metric,
    n: String(n),
  });
  const res = await request<{ points: TrendPoint[] }>(
    `/v1/bench/trends?${qs.toString()}`,
    undefined,
    signal
  );
  return res.points;
}

// ---------------------------------------------------------------------
// Write endpoints — UI-triggered actions
// ---------------------------------------------------------------------

export async function triggerRun(
  body: TriggerRunRequest
): Promise<{ run_id: string | null; warning?: string }> {
  return request<{ run_id: string | null; warning?: string }>(
    "/v1/bench/runs",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function cancelRun(runId: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(
    `/v1/bench/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" }
  );
}

export async function saveBaseline(
  runId: string
): Promise<{ files: string[] }> {
  return request<{ files: string[] }>("/v1/bench/baselines", {
    method: "POST",
    body: JSON.stringify({ run_id: runId }),
  });
}

// Profile artifact URL — components fetch this directly with `fetch()`
// since it returns the speedscope / chrome-trace / DB-plans JSON file.
export function profileArtifactUrl(runId: string, kind: ProfileKind): string {
  return `${BASE}/v1/bench/runs/${encodeURIComponent(runId)}/profiles/${encodeURIComponent(kind)}`;
}
