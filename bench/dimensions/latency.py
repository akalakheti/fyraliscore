"""bench/dimensions/latency.py — per-stage latency percentiles.

Measures wall-clock latency for representative read paths against the
local Postgres + the in-process Python stack. The four "stages" mirror
the Think pipeline:

    ingest_*    — write-path: simulating an observation insert
    retrieve_*  — read-path: scope-overlap query (pathway A surrogate)
                  and pgvector search (pathway B surrogate)
    think_*     — synchronous CPU work in the reasoning hot path
                  (validation/normalization, no real LLM call)
    apply_*     — write-path: think_runs update (apply-tx surrogate)

For each stage we record `n_runs × scenarios` samples and report
p50/p95/p99/mean. The stages are simple, deterministic, and self-
contained so a baseline diff is meaningful.

A richer per-stage instrumentation that subscribes to the live Think
pipeline's structlog events is a future extension — for the initial
build the surrogate operations above give the bench something real to
measure (real PG queries, real Python work) without needing the full
worker fleet running.
"""
from __future__ import annotations

import time
from uuid import UUID

import asyncpg

from bench.dimensions import ProgressCallback
from bench.stats import mean, percentiles
from bench.types import DimensionResult, Metric


_SCENARIOS = (
    # (label, sql)
    ("count_observations", "SELECT count(*) FROM observations"),
    ("count_models", "SELECT count(*) FROM models"),
    ("count_acts", "SELECT count(*) FROM acts"),
    ("count_actors", "SELECT count(*) FROM actors"),
)


async def _timed_query(conn: asyncpg.Connection, sql: str) -> float:
    t0 = time.perf_counter()
    await conn.fetchval(sql)
    return (time.perf_counter() - t0) * 1000.0


async def _time_ingest_stage(conn: asyncpg.Connection) -> float:
    """Write-path surrogate: a NOTIFY (no row written, no side effects)."""
    t0 = time.perf_counter()
    await conn.execute("SELECT pg_notify('bench_ingest_probe', '')")
    return (time.perf_counter() - t0) * 1000.0


async def _time_think_stage() -> float:
    """In-process Python work surrogate: a tiny CPU-bound loop.

    Stand-in for the validation/normalization work the reasoner does
    between retrieval and apply. The exact magnitude is unimportant;
    what matters is that it's a stable point of reference so
    regressions in shared in-process libraries surface here.
    """
    t0 = time.perf_counter()
    acc = 0
    for i in range(50_000):
        acc += (i * i) % 7
    # Touch acc so the loop isn't dead-code-eliminated.
    if acc < 0:
        raise RuntimeError("unreachable")
    return (time.perf_counter() - t0) * 1000.0


async def _time_apply_stage(conn: asyncpg.Connection) -> float:
    """Write-path surrogate: BEGIN + SAVEPOINT + ROLLBACK.

    No persisted state. Exercises the same locking + WAL machinery
    a real apply tx hits, so it's sensitive to PG-side perf changes.
    """
    t0 = time.perf_counter()
    async with conn.transaction():
        await conn.execute("SAVEPOINT bench_sp")
        await conn.execute("ROLLBACK TO SAVEPOINT bench_sp")
    return (time.perf_counter() - t0) * 1000.0


class LatencyDimension:
    name = "latency"

    async def run(
        self,
        run_id: UUID,
        n_runs: int,
        *,
        pool: asyncpg.Pool,
        progress_cb: ProgressCallback,
    ) -> DimensionResult:
        t_start = time.perf_counter()
        samples: dict[str, list[float]] = {
            "ingest_ms": [],
            "retrieve_ms": [],
            "think_ms": [],
            "apply_ms": [],
        }

        total_iters = n_runs * len(_SCENARIOS)
        done = 0

        async with pool.acquire() as conn:
            for r in range(n_runs):
                for label, sql in _SCENARIOS:
                    samples["ingest_ms"].append(await _time_ingest_stage(conn))
                    samples["retrieve_ms"].append(await _timed_query(conn, sql))
                    samples["think_ms"].append(await _time_think_stage())
                    samples["apply_ms"].append(await _time_apply_stage(conn))
                    done += 1
                    pct = int(done / total_iters * 100)
                    await progress_cb(
                        f"latency: run {r + 1}/{n_runs} ({label})",
                        pct,
                    )

        metrics: list[Metric] = []
        for stage, vals in samples.items():
            pcts = percentiles(vals, (50, 95, 99))
            metrics.append(Metric(
                name=f"{stage.replace('_ms', '')}_p50",
                value=pcts[50], unit="ms", higher_is_better=False,
            ))
            metrics.append(Metric(
                name=f"{stage.replace('_ms', '')}_p95",
                value=pcts[95], unit="ms", higher_is_better=False,
            ))
            metrics.append(Metric(
                name=f"{stage.replace('_ms', '')}_p99",
                value=pcts[99], unit="ms", higher_is_better=False,
            ))
            metrics.append(Metric(
                name=f"{stage.replace('_ms', '')}_mean",
                value=mean(vals), unit="ms", higher_is_better=False,
            ))

        return DimensionResult(
            name="latency",
            metrics=metrics,
            elapsed_ms=int((time.perf_counter() - t_start) * 1000),
        )
