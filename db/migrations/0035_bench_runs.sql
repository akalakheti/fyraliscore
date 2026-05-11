-- 0035_bench_runs.sql
--
-- Persistence layer for the bench/ benchmarking system. Three tables:
--
--   1. bench_runs       — one row per benchmark invocation (CLI- or UI-
--                         triggered). Tracks lifecycle (queued → running
--                         → completed/failed/cancelled) plus the git ref
--                         it ran against, which dimensions ran, and the
--                         aggregated regression/improvement counts.
--
--   2. bench_metrics    — fan-out of one row per (run_id, dimension,
--                         metric) tuple. Stores the measured value, the
--                         baseline it was diffed against, the deltas,
--                         and the verdict from bench/stats.is_regression.
--
--   3. bench_profiles   — one row per profiling artifact attached to a
--                         run (cpu / db / trace / memory). The artifact
--                         itself lives on disk under bench/artifacts/<run_id>/;
--                         this row carries the path + a small JSON summary
--                         for quick rendering in the UI.
--
-- Live progress for the UI is driven by progress_pct + current_stage on
-- bench_runs. The runner updates these columns at every dimension/scenario
-- boundary inside a short tx, then issues NOTIFY on channel
-- bench_run_<id> with the new payload. The gateway WebSocket subscribes
-- to that channel and forwards updates to the browser.
--
-- Cancellation: POST /v1/bench/runs/<id>/cancel calls task.cancel() on
-- the in-process asyncio.Task. The runner catches CancelledError, sets
-- status='cancelled' + ended_at=now(), NOTIFYs once more, returns.
--
-- One running benchmark at a time across the instance — enforced by the
-- gateway POST handler reading WHERE status='running' before scheduling
-- a new run. The partial unique index below makes the constraint
-- explicit at the DB level so two simultaneous POSTs cannot both win.
--
-- Idempotent (CREATE … IF NOT EXISTS everywhere).

BEGIN;

-- ---------------------------------------------------------------------
-- bench_runs — one row per benchmark invocation
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bench_runs (
  id              UUID PRIMARY KEY,
  -- Lifecycle. queued is the brief window between INSERT and the
  -- runner starting; running is the work itself; the three terminal
  -- states are completed / failed / cancelled. The UI's dashboard
  -- chip and the concurrency guard both key off this column.
  status          TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  -- Git context captured at run-start. git_dirty=true means the
  -- working tree had uncommitted changes — the result is still
  -- useful but cannot be reproduced from the SHA alone.
  git_sha         TEXT NOT NULL,
  git_branch      TEXT NOT NULL,
  git_dirty       BOOLEAN NOT NULL DEFAULT false,
  -- The git SHA the run was diffed against (the SHA the baseline
  -- JSON files were captured from). NULL when this run has no
  -- baseline (e.g. the first-ever run, or --update-baseline mode).
  baseline_sha    TEXT,
  -- Which dimensions ran. Subset of:
  --   latency / throughput / retrieval_quality / reasoning_quality / cost
  dimensions      TEXT[] NOT NULL,
  -- Which profile kinds were captured. Subset of: cpu / db / trace / memory.
  profile_kinds   TEXT[] NOT NULL DEFAULT '{}',
  -- N runs per scenario — for the percentile rollup. UI form default 5.
  n_runs          INT NOT NULL CHECK (n_runs >= 1),
  -- Who started it. Convention: "ui:<email>" or "cli:<host>".
  triggered_by    TEXT NOT NULL,
  -- Live-progress columns. The runner writes these inside a short
  -- transaction at every meaningful boundary and emits NOTIFY on
  -- channel bench_run_<id> with the JSON payload. progress_pct is
  -- clamped 0..100; current_stage is freeform display text.
  current_stage   TEXT,
  progress_pct    INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  -- Aggregated verdict counts (computed at run completion from
  -- bench_metrics). Surfaced in the dashboard KPI strip.
  regressions     INT NOT NULL DEFAULT 0,
  improvements    INT NOT NULL DEFAULT 0,
  -- Populated when status='failed'. Free-form; usually the exception
  -- type + message + a short traceback excerpt.
  error           TEXT,
  -- Optional note from the BenchNew.tsx form ("Trying HNSW ef_search=80").
  notes           TEXT
);

-- Dashboard query: "show me the 20 most recent runs by start time,
-- grouped by status for the status chip."
CREATE INDEX IF NOT EXISTS bench_runs_status_started_idx
  ON bench_runs (status, started_at DESC);

-- Concurrency guard: at most one running benchmark at a time across
-- the instance. The gateway POST handler reads this index before
-- scheduling; the unique constraint catches a simultaneous-POST race.
CREATE UNIQUE INDEX IF NOT EXISTS bench_runs_single_running_idx
  ON bench_runs ((status))
  WHERE status = 'running';

-- ---------------------------------------------------------------------
-- bench_metrics — per-(run, dimension, metric) results
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bench_metrics (
  id              UUID PRIMARY KEY,
  run_id          UUID NOT NULL REFERENCES bench_runs(id) ON DELETE CASCADE,
  -- One of: latency / throughput / retrieval_quality / reasoning_quality / cost
  dimension       TEXT NOT NULL,
  -- Free-form metric name within the dimension. Examples:
  --   latency:     ingest_p50, retrieve_p95, think_p99
  --   throughput:  signals_per_sec_at_c16, saturation_concurrency
  --   retrieval:   recall_at_10, ndcg_at_10, pathway_a_share
  --   reasoning:   ece, pass_rate, pass_rate_t2
  --   cost:        mean_usd_per_run, p95_input_tokens, p95_output_tokens
  metric          TEXT NOT NULL,
  -- Measured value from the current run.
  value           DOUBLE PRECISION NOT NULL,
  -- Baseline value loaded from bench/baselines/<dimension>.json. NULL
  -- when the run had no baseline (first-ever run, or new metric not yet
  -- in the baseline file).
  baseline        DOUBLE PRECISION,
  delta_abs       DOUBLE PRECISION,
  delta_pct       DOUBLE PRECISION,
  -- The threshold this metric was checked against (from
  -- bench/thresholds.json). Stored so the UI can render the threshold
  -- band in trend charts without re-reading the JSON.
  threshold       DOUBLE PRECISION,
  -- Verdict from bench/stats.is_regression: ok / regression /
  -- improvement. 'ok' covers both "no baseline" and "within threshold".
  verdict         TEXT NOT NULL CHECK (verdict IN (
    'ok', 'regression', 'improvement'
  ))
);

-- Run-detail query: "fetch all metrics for this run, grouped by dimension."
CREATE INDEX IF NOT EXISTS bench_metrics_run_idx
  ON bench_metrics (run_id);

-- Trends query: "give me the last N values of metric X across all runs."
CREATE INDEX IF NOT EXISTS bench_metrics_dimension_metric_idx
  ON bench_metrics (dimension, metric);

-- ---------------------------------------------------------------------
-- bench_profiles — profiling artifacts attached to a run
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bench_profiles (
  id              UUID PRIMARY KEY,
  run_id          UUID NOT NULL REFERENCES bench_runs(id) ON DELETE CASCADE,
  -- One of: cpu / db / trace / memory.
  kind            TEXT NOT NULL CHECK (kind IN (
    'cpu', 'db', 'trace', 'memory'
  )),
  -- Path under bench/artifacts/<run_id>/. The actual artifact (speedscope
  -- JSON / DB plans / chrome-trace JSON / tracemalloc dump) lives on
  -- disk; we don't store the bytes in PG.
  artifact_path   TEXT NOT NULL,
  -- Small JSON for the dashboard card preview without fetching the
  -- full artifact. Examples:
  --   cpu:    {"top_funcs": [...], "total_ms": 4231}
  --   db:     {"slowest_query": "SELECT … HNSW …", "total_db_ms": 891}
  --   trace:  {"think_runs": 12, "max_span_ms": 3104}
  --   memory: {"top_allocator": "lib.topology.embeddings:42", "delta_mb": 8.2}
  summary         JSONB
);

CREATE INDEX IF NOT EXISTS bench_profiles_run_idx
  ON bench_profiles (run_id);

COMMIT;
