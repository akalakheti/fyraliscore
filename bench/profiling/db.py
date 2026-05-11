"""bench/profiling/db.py — SQL query timing + EXPLAIN ANALYZE for slow ones.

Approach:

  1. While the benchmark runs, every query that goes through asyncpg
     can be intercepted via `Connection.add_query_logger` (asyncpg
     supports a query-logging hook). We register a hook that records
     `(query_text, args_count, elapsed_ms)` for every executed query.

  2. After the benchmark dimension finishes, we pick the top-50 unique
     queries by total elapsed time and replay each with
     `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. The resulting plan JSON
     is stored in the artifact for the UI's QueryPlan component.

If `add_query_logger` is unavailable (older asyncpg), the profiler
falls back to a no-op + summary noting why.
"""
from __future__ import annotations

import contextlib
import json
import logging
import re
import time
from collections import defaultdict
from typing import Any
from uuid import UUID

import asyncpg

from bench import config as bench_config
from bench.types import ProfileArtifact


log = logging.getLogger("bench.profiling.db")


# Queries we never want to EXPLAIN ANALYZE — utility statements that
# either lack a plan or would be perturbed by the analyze step.
_SKIP_PREFIXES = (
    "EXPLAIN",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "SAVEPOINT",
    "ROLLBACK TO",
    "RELEASE",
    "LISTEN",
    "UNLISTEN",
    "NOTIFY",
    "SET ",
    "DISCARD",
)


def _normalize(sql: str) -> str:
    """Collapse whitespace so the same SQL pattern aggregates cleanly."""
    return re.sub(r"\s+", " ", sql).strip()


class DBProfiler:
    kind = "db"

    def __init__(self) -> None:
        self._samples: dict[str, list[float]] = defaultdict(list)
        self._pool: asyncpg.Pool | None = None
        self._listener = None
        self._t_start: float = 0.0

    @contextlib.asynccontextmanager
    async def capture(self, run_id: UUID, *, pool: asyncpg.Pool):
        self._pool = pool
        self._t_start = time.perf_counter()
        try:
            self._listener = await self._install_listener(pool)
        except Exception as e:
            log.warning("db_profiler.install_failed", exc_info=e)
            self._listener = None
        try:
            yield self
        finally:
            if self._listener is not None:
                with contextlib.suppress(Exception):
                    await self._remove_listener(pool, self._listener)

    async def _install_listener(self, pool: asyncpg.Pool):
        """Install a query-completed callback on every connection in the pool.

        asyncpg exposes `Connection.add_query_logger` per-connection.
        We install on every existing connection and also on
        subsequently-acquired connections via the pool's `setup` hook.
        For simplicity here we walk the connections the pool exposes
        and skip the setup-hook plumbing — this means queries on
        connections acquired after the listener installation are not
        logged. Acceptable for a coarse profile.
        """
        def logger(record: Any) -> None:
            try:
                sql = _normalize(record.query)
            except Exception:
                return
            up = sql.upper()
            if any(up.startswith(pref) for pref in _SKIP_PREFIXES):
                return
            elapsed_ms = (record.elapsed or 0) * 1000.0
            self._samples[sql].append(elapsed_ms)

        # asyncpg.Pool keeps holders internally; iterate and call
        # add_query_logger on each connection's underlying Connection.
        # If the API isn't available, raise.
        installed_on = []
        try:
            holders = list(getattr(pool, "_holders", []))
            for h in holders:
                conn = getattr(h, "_con", None)
                if conn is None:
                    continue
                if hasattr(conn, "add_query_logger"):
                    conn.add_query_logger(logger)
                    installed_on.append(conn)
        except Exception:
            pass
        if not installed_on:
            # Fallback: try one ad-hoc acquire to install on at least
            # one connection so we capture *something*.
            with contextlib.suppress(Exception):
                async with pool.acquire() as conn:
                    if hasattr(conn, "add_query_logger"):
                        conn.add_query_logger(logger)
                        installed_on.append(conn)
        return (logger, installed_on)

    async def _remove_listener(self, pool: asyncpg.Pool, listener) -> None:
        logger, conns = listener
        for conn in conns:
            with contextlib.suppress(Exception):
                conn.remove_query_logger(logger)

    async def write(self, run_id: UUID) -> ProfileArtifact:
        out_dir = bench_config.ARTIFACTS_DIR / str(run_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        plans_path = out_dir / "db_plans.json"

        # Rank by total elapsed across all calls.
        ranked = sorted(
            self._samples.items(),
            key=lambda kv: sum(kv[1]),
            reverse=True,
        )[:50]

        plans: list[dict[str, Any]] = []
        if self._pool is not None:
            async with self._pool.acquire() as conn:
                for sql, samples in ranked:
                    total_ms = sum(samples)
                    plan = None
                    plan_err = None
                    try:
                        # EXPLAIN ANALYZE only safe for read queries.
                        # Skip writes to be conservative.
                        up = sql.upper().lstrip()
                        if up.startswith(("SELECT", "WITH")):
                            row = await conn.fetchrow(
                                f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}"
                            )
                            if row:
                                plan = row[0]
                    except Exception as e:
                        plan_err = str(e)
                    plans.append({
                        "sql": sql[:2000],
                        "calls": len(samples),
                        "total_ms": round(total_ms, 2),
                        "mean_ms": round(total_ms / max(len(samples), 1), 2),
                        "max_ms": round(max(samples) if samples else 0.0, 2),
                        "plan": plan,
                        "plan_error": plan_err,
                    })

        total_db_ms = sum(sum(v) for v in self._samples.values())
        slowest = plans[0]["sql"] if plans else None

        plans_path.write_text(json.dumps({
            "plans": plans,
            "total_queries": sum(len(v) for v in self._samples.values()),
            "total_db_ms": round(total_db_ms, 2),
        }, indent=2))

        summary = {
            "total_queries": sum(len(v) for v in self._samples.values()),
            "total_db_ms": round(total_db_ms, 2),
            "slowest_query": slowest[:200] if slowest else None,
        }
        return ProfileArtifact(
            kind="db",
            artifact_path=str(plans_path.relative_to(bench_config.REPO_ROOT)),
            summary=summary,
        )
