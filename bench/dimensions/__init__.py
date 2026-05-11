"""bench/dimensions/ — one module per measurement axis.

Every dimension exports:

    async def run(run_id, n_runs, *, pool, progress_cb) -> DimensionResult

`progress_cb(stage_text: str, pct: int)` is called by the dimension at
its own boundaries (between scenarios, between sub-stages). The runner
threads progress updates through to bench.store.update_progress.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol
from uuid import UUID

import asyncpg

from bench.types import DimensionResult


ProgressCallback = Callable[[str, int], Awaitable[None]]


class Dimension(Protocol):
    name: str

    async def run(
        self,
        run_id: UUID,
        n_runs: int,
        *,
        pool: asyncpg.Pool,
        progress_cb: ProgressCallback,
    ) -> DimensionResult: ...
