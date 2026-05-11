"""bench/store.py — persistence for bench_runs / bench_metrics / bench_profiles.

All DB writes that the runner emits go through this module. Includes
the LISTEN/NOTIFY hook the gateway WebSocket relies on for live progress.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg

from bench.types import (
    DimensionName,
    Metric,
    ProfileArtifact,
    RunStatus,
    RunSummary,
)
from lib.shared.db import get_pool
from lib.shared.ids import uuid7


# Channel name pattern for live progress NOTIFYs.
def notify_channel(run_id: UUID) -> str:
    return f"bench_run_{str(run_id).replace('-', '_')}"


async def insert_run(summary: RunSummary, *, pool: asyncpg.Pool | None = None) -> None:
    """Insert the initial row at run-start with status='queued' or 'running'."""
    p = pool or get_pool()
    async with p.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO bench_runs
              (id, status, started_at, git_sha, git_branch, git_dirty,
               baseline_sha, dimensions, profile_kinds, n_runs,
               triggered_by, current_stage, progress_pct,
               regressions, improvements, error, notes)
            VALUES
              ($1, $2, now(), $3, $4, $5, $6, $7::text[], $8::text[],
               $9, $10, $11, $12, 0, 0, NULL, $13)
            """,
            summary.id,
            summary.status,
            summary.git.sha,
            summary.git.branch,
            summary.git.dirty,
            summary.baseline_sha,
            list(summary.dimensions),
            list(summary.profile_kinds),
            summary.n_runs,
            summary.triggered_by,
            summary.current_stage,
            summary.progress_pct,
            summary.notes,
        )


async def update_progress(
    run_id: UUID,
    *,
    status: RunStatus | None = None,
    current_stage: str | None = None,
    progress_pct: int | None = None,
    error: str | None = None,
    regressions: int | None = None,
    improvements: int | None = None,
    pool: asyncpg.Pool | None = None,
) -> None:
    """Patch a subset of columns on bench_runs and emit NOTIFY.

    Live progress is driven entirely by this function — the WebSocket
    in the gateway listens on `bench_run_<id>` and forwards the
    payload to the browser.
    """
    p = pool or get_pool()
    set_clauses: list[str] = []
    params: list[Any] = []
    i = 1
    if status is not None:
        set_clauses.append(f"status = ${i}")
        params.append(status)
        i += 1
        if status in ("completed", "failed", "cancelled"):
            set_clauses.append("ended_at = now()")
    if current_stage is not None:
        set_clauses.append(f"current_stage = ${i}")
        params.append(current_stage)
        i += 1
    if progress_pct is not None:
        # Clamp to satisfy the CHECK constraint defensively.
        clamped = max(0, min(100, int(progress_pct)))
        set_clauses.append(f"progress_pct = ${i}")
        params.append(clamped)
        i += 1
    if error is not None:
        set_clauses.append(f"error = ${i}")
        params.append(error)
        i += 1
    if regressions is not None:
        set_clauses.append(f"regressions = ${i}")
        params.append(regressions)
        i += 1
    if improvements is not None:
        set_clauses.append(f"improvements = ${i}")
        params.append(improvements)
        i += 1

    if not set_clauses:
        return

    params.append(run_id)
    sql = f"UPDATE bench_runs SET {', '.join(set_clauses)} WHERE id = ${i}"

    payload = json.dumps({
        "run_id": str(run_id),
        "status": status,
        "current_stage": current_stage,
        "progress_pct": progress_pct,
        "error": error,
        "regressions": regressions,
        "improvements": improvements,
    })
    channel = notify_channel(run_id)

    async with p.acquire() as conn:
        async with conn.transaction():
            await conn.execute(sql, *params)
            # NOTIFY argument can be at most ~8KB; our payload is tiny.
            await conn.execute("SELECT pg_notify($1, $2)", channel, payload)


async def insert_metrics(
    run_id: UUID,
    dimension: DimensionName,
    metrics: list[Metric],
    *,
    pool: asyncpg.Pool | None = None,
) -> None:
    """Bulk-insert the metrics for one completed dimension."""
    if not metrics:
        return
    p = pool or get_pool()
    rows = [
        (
            uuid7(),
            run_id,
            dimension,
            m.name,
            float(m.value),
            float(m.baseline) if m.baseline is not None else None,
            float(m.delta_abs) if m.delta_abs is not None else None,
            float(m.delta_pct) if m.delta_pct is not None else None,
            float(m.threshold) if m.threshold is not None else None,
            m.verdict,
        )
        for m in metrics
    ]
    async with p.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO bench_metrics
              (id, run_id, dimension, metric, value, baseline,
               delta_abs, delta_pct, threshold, verdict)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            rows,
        )


async def insert_profile(
    run_id: UUID,
    artifact: ProfileArtifact,
    *,
    pool: asyncpg.Pool | None = None,
) -> None:
    p = pool or get_pool()
    async with p.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO bench_profiles (id, run_id, kind, artifact_path, summary)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            """,
            uuid7(),
            run_id,
            artifact.kind,
            artifact.artifact_path,
            json.dumps(artifact.summary, default=str),
        )


async def list_recent_runs(
    *,
    limit: int = 20,
    pool: asyncpg.Pool | None = None,
) -> list[dict[str, Any]]:
    p = pool or get_pool()
    rows = await p.fetch(
        """
        SELECT id, status, started_at, ended_at, git_sha, git_branch,
               git_dirty, baseline_sha, dimensions, profile_kinds,
               n_runs, triggered_by, current_stage, progress_pct,
               regressions, improvements, error, notes
        FROM bench_runs
        ORDER BY started_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


async def get_run(
    run_id: UUID,
    *,
    pool: asyncpg.Pool | None = None,
) -> dict[str, Any] | None:
    p = pool or get_pool()
    row = await p.fetchrow(
        """
        SELECT id, status, started_at, ended_at, git_sha, git_branch,
               git_dirty, baseline_sha, dimensions, profile_kinds,
               n_runs, triggered_by, current_stage, progress_pct,
               regressions, improvements, error, notes
        FROM bench_runs WHERE id = $1
        """,
        run_id,
    )
    return dict(row) if row else None


async def get_run_metrics(
    run_id: UUID,
    *,
    pool: asyncpg.Pool | None = None,
) -> list[dict[str, Any]]:
    p = pool or get_pool()
    rows = await p.fetch(
        """
        SELECT dimension, metric, value, baseline, delta_abs,
               delta_pct, threshold, verdict
        FROM bench_metrics
        WHERE run_id = $1
        ORDER BY dimension, metric
        """,
        run_id,
    )
    return [dict(r) for r in rows]


async def get_run_profiles(
    run_id: UUID,
    *,
    pool: asyncpg.Pool | None = None,
) -> list[dict[str, Any]]:
    p = pool or get_pool()
    rows = await p.fetch(
        """
        SELECT kind, artifact_path, summary
        FROM bench_profiles
        WHERE run_id = $1
        ORDER BY kind
        """,
        run_id,
    )
    return [dict(r) for r in rows]


async def find_running_run(
    *,
    pool: asyncpg.Pool | None = None,
) -> dict[str, Any] | None:
    """Concurrency guard helper. Returns the in-progress run or None."""
    p = pool or get_pool()
    row = await p.fetchrow(
        "SELECT id, started_at, current_stage, progress_pct FROM bench_runs "
        "WHERE status = 'running' LIMIT 1"
    )
    return dict(row) if row else None


async def trends_for_metric(
    dimension: str,
    metric: str,
    *,
    limit: int = 50,
    pool: asyncpg.Pool | None = None,
) -> list[dict[str, Any]]:
    p = pool or get_pool()
    rows = await p.fetch(
        """
        SELECT r.id AS run_id, r.started_at, r.git_sha, r.git_branch,
               m.value, m.baseline, m.delta_pct, m.delta_abs,
               m.threshold, m.verdict
        FROM bench_metrics m
        JOIN bench_runs r ON r.id = m.run_id
        WHERE m.dimension = $1 AND m.metric = $2
          AND r.status = 'completed'
        ORDER BY r.started_at DESC
        LIMIT $3
        """,
        dimension, metric, limit,
    )
    return [dict(r) for r in rows]
