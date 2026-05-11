"""bench/dimensions/cost.py — $ / token aggregation from think_run_costs.

Reads recent rows from `think_run_costs` (the persistent cost record
written post-commit by services/think/observability.py:record_think_run_cost)
and aggregates them into per-run cost metrics:

    mean_usd_per_run    — average $/Think across the window
    p95_input_tokens    — 95th-percentile input-token count
    p95_output_tokens   — 95th-percentile output-token count
    mean_llm_calls      — average LLM calls per Think run
    total_runs_observed — how many think_run_costs rows the bench saw

The "window" is defined by the n_runs parameter as a multiplier on a
fixed-recent slice of the table: we look at the last `max(50, n_runs*10)`
rows. This keeps the dim insensitive to long-term cost drift outside
the user's current activity.

When `think_run_costs` is empty (fresh DB, or no Think runs since the
last truncation) the dim returns zero-valued metrics with a single-row
error note attached. That keeps the run from failing outright and lets
the UI render a "no cost data yet" state.
"""
from __future__ import annotations

import time
from uuid import UUID

import asyncpg

from bench.dimensions import ProgressCallback
from bench.stats import mean, percentiles
from bench.types import DimensionResult, Metric


class CostDimension:
    name = "cost"

    async def run(
        self,
        run_id: UUID,
        n_runs: int,
        *,
        pool: asyncpg.Pool,
        progress_cb: ProgressCallback,
    ) -> DimensionResult:
        t_start = time.perf_counter()
        await progress_cb("cost: reading think_run_costs", 5)
        window = max(50, n_runs * 10)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT llm_cost_usd, llm_input_tokens_total,
                       llm_output_tokens_total, llm_calls_count,
                       latency_total_ms
                FROM think_run_costs
                ORDER BY computed_at DESC
                LIMIT $1
                """,
                window,
            )

        await progress_cb(f"cost: aggregating {len(rows)} rows", 60)

        if not rows:
            metrics = [
                Metric(name="mean_usd_per_run", value=0.0, unit="$/run",
                       higher_is_better=False),
                Metric(name="p95_input_tokens", value=0.0, unit="tokens",
                       higher_is_better=False),
                Metric(name="p95_output_tokens", value=0.0, unit="tokens",
                       higher_is_better=False),
                Metric(name="mean_llm_calls", value=0.0, unit="calls/run",
                       higher_is_better=False),
                Metric(name="total_runs_observed", value=0.0, unit="runs",
                       higher_is_better=True),
            ]
            return DimensionResult(
                name="cost",
                metrics=metrics,
                elapsed_ms=int((time.perf_counter() - t_start) * 1000),
                error="think_run_costs is empty — no cost data to aggregate",
            )

        costs = [float(r["llm_cost_usd"] or 0.0) for r in rows]
        in_tokens = [float(r["llm_input_tokens_total"] or 0) for r in rows]
        out_tokens = [float(r["llm_output_tokens_total"] or 0) for r in rows]
        calls = [float(r["llm_calls_count"] or 0) for r in rows]

        await progress_cb("cost: computing percentiles", 90)

        in_p = percentiles(in_tokens, (95,))[95]
        out_p = percentiles(out_tokens, (95,))[95]

        metrics = [
            Metric(name="mean_usd_per_run", value=mean(costs),
                   unit="$/run", higher_is_better=False),
            Metric(name="p95_input_tokens", value=in_p,
                   unit="tokens", higher_is_better=False),
            Metric(name="p95_output_tokens", value=out_p,
                   unit="tokens", higher_is_better=False),
            Metric(name="mean_llm_calls", value=mean(calls),
                   unit="calls/run", higher_is_better=False),
            Metric(name="total_runs_observed", value=float(len(rows)),
                   unit="runs", higher_is_better=True),
        ]
        await progress_cb("cost: done", 100)
        return DimensionResult(
            name="cost",
            metrics=metrics,
            elapsed_ms=int((time.perf_counter() - t_start) * 1000),
        )
