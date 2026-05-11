"""bench/dimensions/throughput.py — sustained signals/sec under a concurrency sweep.

Measures throughput of a synthetic ingestion pipeline at three
concurrency levels (8 / 16 / 32). For each level we dispatch N
async-tasks each running M scenario items where every item performs a
small PG write-equivalent (NOTIFY) plus a fixed-sleep think-time. The
resulting `signals_per_sec` is reported per level along with the p95
per-signal latency observed during the burst.

The shape of the "scenario item" intentionally mirrors the cost
profile of a real Think trigger so the metric tracks something
proportional to production throughput:

  - 1 small PG round-trip   (NOTIFY)
  - 1 in-process await sleep with jitter
  - 1 small PG read         (SELECT 1)

When concurrency causes wall-clock latency to balloon past an SLO
ceiling (200 ms p95), we mark `saturated=True` for that level. The
saturation_concurrency metric exposes the lowest saturated level for
trend analysis.
"""
from __future__ import annotations

import asyncio
import random
import time
from uuid import UUID

import asyncpg

from bench.dimensions import ProgressCallback
from bench.stats import percentiles
from bench.types import DimensionResult, Metric


CONCURRENCY_LEVELS = (8, 16, 32)
SIGNALS_PER_LEVEL = 100
SATURATION_MS = 200.0


async def _one_signal(conn: asyncpg.Connection) -> float:
    t0 = time.perf_counter()
    await conn.execute("SELECT pg_notify('bench_throughput_probe', '')")
    await asyncio.sleep(0.001 + random.random() * 0.002)
    await conn.fetchval("SELECT 1")
    return (time.perf_counter() - t0) * 1000.0


async def _run_at_concurrency(
    pool: asyncpg.Pool,
    concurrency: int,
    n_signals: int,
) -> tuple[float, float]:
    """Returns (signals_per_sec, p95_latency_ms)."""
    sem = asyncio.Semaphore(concurrency)
    latencies: list[float] = []

    async def _task() -> None:
        async with sem:
            async with pool.acquire() as conn:
                latencies.append(await _one_signal(conn))

    t0 = time.perf_counter()
    await asyncio.gather(*[_task() for _ in range(n_signals)])
    wall = max(time.perf_counter() - t0, 1e-6)
    sps = n_signals / wall
    p95 = percentiles(latencies, (95,))[95]
    return sps, p95


class ThroughputDimension:
    name = "throughput"

    async def run(
        self,
        run_id: UUID,
        n_runs: int,
        *,
        pool: asyncpg.Pool,
        progress_cb: ProgressCallback,
    ) -> DimensionResult:
        t_start = time.perf_counter()
        metrics: list[Metric] = []
        saturation: int | None = None
        total_levels = len(CONCURRENCY_LEVELS)

        for idx, c in enumerate(CONCURRENCY_LEVELS):
            base_pct = int(idx / total_levels * 100)
            await progress_cb(f"throughput: warming concurrency={c}", base_pct)
            # n_runs slightly scales the burst so longer runs get a tighter
            # signals/sec estimate.
            signals = max(SIGNALS_PER_LEVEL, n_runs * 20)
            sps, p95 = await _run_at_concurrency(pool, c, signals)

            sat = p95 > SATURATION_MS
            if sat and saturation is None:
                saturation = c

            metrics.append(Metric(
                name=f"signals_per_sec_at_c{c}",
                value=sps, unit="signals/sec", higher_is_better=True,
            ))
            metrics.append(Metric(
                name=f"p95_latency_at_c{c}",
                value=p95, unit="ms", higher_is_better=False,
            ))
            metrics.append(Metric(
                name=f"saturated_at_c{c}",
                value=1.0 if sat else 0.0, unit="bool",
                higher_is_better=False,
            ))

        metrics.append(Metric(
            name="saturation_concurrency",
            value=float(saturation if saturation is not None else CONCURRENCY_LEVELS[-1] + 1),
            unit="concurrency",
            higher_is_better=True,
        ))

        return DimensionResult(
            name="throughput",
            metrics=metrics,
            elapsed_ms=int((time.perf_counter() - t_start) * 1000),
        )
