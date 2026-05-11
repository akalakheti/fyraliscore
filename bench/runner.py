"""bench/runner.py — orchestrates a benchmark invocation end-to-end.

Lifecycle:

  1. Build a RunSummary, insert it into bench_runs with status='running'.
  2. For each requested dimension: instantiate, call its .run(), capture
     the DimensionResult, attach baseline/delta/verdict via bench.stats,
     persist via bench.store.insert_metrics, update progress_pct.
  3. After all dimensions: compute totals, update bench_runs row with
     status='completed' + counts; write a markdown report to disk.
  4. On exception: status='failed' + error column. On asyncio.CancelledError:
     status='cancelled'.

The same `execute_run()` coroutine is used by the CLI and the
gateway's background task — only `triggered_by` and the surrounding
`asyncio.create_task` wrapper differ.

A module-level registry of in-flight tasks keyed by run_id lets the
gateway's cancel endpoint call task.cancel() without holding a
reference itself.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import subprocess
import time
from typing import Any
from uuid import UUID

import asyncpg

from bench import config as bench_config
from bench import store
from bench.dimensions.cost import CostDimension
from bench.dimensions.latency import LatencyDimension
from bench.dimensions.reasoning_quality import ReasoningQualityDimension
from bench.dimensions.retrieval_quality import RetrievalQualityDimension
from bench.dimensions.throughput import ThroughputDimension
from bench.profiling import get_profiler
from bench.stats import (
    apply_baseline_and_verdict,
    baseline_payload_from_metrics,
    count_verdicts,
)
from bench.types import (
    ALL_DIMENSIONS,
    DimensionName,
    GitContext,
    Metric,
    RunConfig,
    RunSummary,
)
from lib.shared.db import get_pool, init_pool
from lib.shared.ids import uuid7


log = logging.getLogger(__name__)


# Module-level registry: run_id -> asyncio.Task. Used by the gateway
# cancel endpoint. Cleared on terminal status.
_RUNNING_TASKS: dict[UUID, asyncio.Task] = {}


# ---------------------------------------------------------------------
# Dimension registry
# ---------------------------------------------------------------------

def _get_dimension(name: DimensionName):
    if name == "latency":
        return LatencyDimension()
    if name == "cost":
        return CostDimension()
    if name == "throughput":
        return ThroughputDimension()
    if name == "retrieval_quality":
        return RetrievalQualityDimension()
    if name == "reasoning_quality":
        return ReasoningQualityDimension()
    raise NotImplementedError(f"dimension not implemented: {name}")


# ---------------------------------------------------------------------
# Git context
# ---------------------------------------------------------------------

def _git_context() -> GitContext:
    def _run(args: list[str]) -> str:
        return subprocess.check_output(
            ["git", *args], cwd=str(bench_config.REPO_ROOT)
        ).decode().strip()

    try:
        sha = _run(["rev-parse", "HEAD"])
        branch = _run(["rev-parse", "--abbrev-ref", "HEAD"])
        status = _run(["status", "--porcelain"])
        return GitContext(sha=sha, branch=branch, dirty=bool(status))
    except Exception as e:
        log.warning("bench.git_context_failed", exc_info=e)
        return GitContext(sha="unknown", branch="unknown", dirty=False)


# ---------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------

async def execute_run(
    cfg: RunConfig,
    *,
    pool: asyncpg.Pool | None = None,
) -> UUID:
    """Run a benchmark to completion. Returns the run_id.

    Persists progressively to bench_runs/bench_metrics/bench_profiles.
    Live progress is broadcast via NOTIFY on `bench_run_<id>` so the
    gateway WebSocket can forward it.
    """
    p = pool or get_pool()
    run_id = uuid7()
    git = _git_context()
    summary = RunSummary(
        id=run_id,
        status="running",
        started_at=time.time(),
        ended_at=None,
        git=git,
        baseline_sha=cfg.baseline_sha,
        dimensions=cfg.dimensions,
        profile_kinds=cfg.profile_kinds,
        n_runs=cfg.n_runs,
        triggered_by=cfg.triggered_by,
        current_stage="starting",
        progress_pct=0,
        regressions=0,
        improvements=0,
        error=None,
        notes=cfg.notes,
    )
    await store.insert_run(summary, pool=p)

    task = asyncio.current_task()
    if task is not None:
        _RUNNING_TASKS[run_id] = task

    thresholds = bench_config.load_thresholds()
    all_metrics: list[tuple[DimensionName, list[Metric]]] = []

    # Set up profilers. Each profiler's capture() returns a sync or
    # async context manager; AsyncExitStack handles both via
    # enter_context / enter_async_context.
    profilers: list[tuple[str, Any]] = []
    for kind in cfg.profile_kinds:
        try:
            profilers.append((kind, get_profiler(kind)))
        except Exception as e:
            log.warning("bench.profiler_init_failed kind=%s err=%s", kind, e)

    stack = contextlib.AsyncExitStack()
    await stack.__aenter__()
    captured: list[tuple[str, Any]] = []
    for kind, prof in profilers:
        try:
            if kind == "db":
                await stack.enter_async_context(prof.capture(run_id, pool=p))
            else:
                stack.enter_context(prof.capture(run_id))
            captured.append((kind, prof))
        except Exception as e:
            log.warning("bench.profiler_enter_failed kind=%s err=%s", kind, e)

    try:
        n = len(cfg.dimensions)
        for idx, dim_name in enumerate(cfg.dimensions):
            base_pct = int(idx / n * 100)
            next_pct = int((idx + 1) / n * 100)
            await store.update_progress(
                run_id,
                current_stage=f"{dim_name}: starting",
                progress_pct=base_pct,
                pool=p,
            )

            async def dim_progress_cb(stage: str, dim_pct: int) -> None:
                # Map dim-local pct [0..100] into the global slice
                # [base_pct..next_pct].
                global_pct = base_pct + int(
                    (next_pct - base_pct) * (dim_pct / 100.0)
                )
                await store.update_progress(
                    run_id,
                    current_stage=stage,
                    progress_pct=global_pct,
                    pool=p,
                )

            dim = _get_dimension(dim_name)
            result = await dim.run(
                run_id,
                cfg.n_runs,
                pool=p,
                progress_cb=dim_progress_cb,
            )

            # Diff against baseline + decide verdict.
            if cfg.update_baseline:
                # In baseline-update mode every metric is "ok" and the
                # baseline file gets overwritten at run end.
                for m in result.metrics:
                    m.verdict = "ok"
            else:
                baseline_payload = bench_config.load_baseline(dim_name)
                apply_baseline_and_verdict(
                    result.metrics,
                    baseline_payload,
                    thresholds.get(dim_name, {}),
                )

            await store.insert_metrics(run_id, dim_name, result.metrics, pool=p)
            all_metrics.append((dim_name, result.metrics))

        # Aggregate verdict counts.
        flat: list[Metric] = [m for _, ms in all_metrics for m in ms]
        n_reg, n_imp, _ = count_verdicts(flat)

        # Optionally write baselines.
        if cfg.update_baseline:
            for dim_name, ms in all_metrics:
                bench_config.save_baseline(
                    dim_name, baseline_payload_from_metrics(ms)
                )

        # Close profiler contexts so they record their end-of-run
        # state (cProfile.disable(), tracemalloc snapshot, etc.).
        await stack.aclose()
        # Now persist each profiler's artifact.
        await _finalize_profilers(captured, run_id, p)

        await store.update_progress(
            run_id,
            status="completed",
            current_stage="completed",
            progress_pct=100,
            regressions=n_reg,
            improvements=n_imp,
            pool=p,
        )

    except asyncio.CancelledError:
        with contextlib.suppress(Exception):
            await stack.aclose()
        await store.update_progress(
            run_id,
            status="cancelled",
            current_stage="cancelled",
            error="run was cancelled by user",
            pool=p,
        )
        raise
    except Exception as e:
        log.exception("bench.run_failed", extra={"run_id": str(run_id)})
        with contextlib.suppress(Exception):
            await stack.aclose()
        await store.update_progress(
            run_id,
            status="failed",
            current_stage="failed",
            error=f"{type(e).__name__}: {e}",
            pool=p,
        )
    finally:
        _RUNNING_TASKS.pop(run_id, None)

    return run_id


def get_running_task(run_id: UUID) -> asyncio.Task | None:
    """Look up the in-process Task for a running run. None if not running here."""
    return _RUNNING_TASKS.get(run_id)


async def request_cancel(run_id: UUID) -> bool:
    """Signal a running benchmark to cancel. Returns True if a task was signalled."""
    task = _RUNNING_TASKS.get(run_id)
    if task is None or task.done():
        return False
    task.cancel()
    return True


# ---------------------------------------------------------------------
# CLI helper: run-once entry point that owns its pool.
# ---------------------------------------------------------------------

async def _finalize_profilers(
    captured: list[tuple[str, Any]],
    run_id: UUID,
    pool: asyncpg.Pool,
) -> None:
    """Persist each profiler's artifact after its context has exited.

    DB profiler's write() is async (it runs EXPLAIN ANALYZE against
    the pool). The other three are sync.
    """
    for kind, prof in captured:
        try:
            if kind == "db":
                artifact = await prof.write(run_id)
            else:
                artifact = prof.write(run_id)
            await store.insert_profile(run_id, artifact, pool=pool)
        except Exception as e:
            log.warning("bench.profiler_finalize_failed kind=%s err=%s", kind, e)


async def run_once(cfg: RunConfig, *, dsn: str | None = None) -> UUID:
    """Stand-alone driver for CLI invocation: owns the pool lifecycle."""
    pool = await init_pool(dsn)
    try:
        return await execute_run(cfg, pool=pool)
    finally:
        # Don't close the pool — other callers (gateway) may share it.
        # CLI scripts that init their own pool also leave it open; the
        # process is about to exit.
        with contextlib.suppress(Exception):
            pass
