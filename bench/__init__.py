"""bench/ — multi-dimensional benchmarking + regression detection.

Top-level package. Public surface:

    from bench.runner import execute_run, RunConfig
    from bench.types import DimensionResult, Metric, Verdict
    from bench import store

The CLI entry point lives in `bench.cli:main` and is wired through
`python -m bench`.
"""
from __future__ import annotations

from bench.types import (
    DimensionResult,
    Metric,
    RunConfig,
    RunStatus,
    Verdict,
)

__all__ = [
    "DimensionResult",
    "Metric",
    "RunConfig",
    "RunStatus",
    "Verdict",
]
