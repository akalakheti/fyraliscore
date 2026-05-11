"""bench/types.py — shared dataclasses used by every layer of the bench.

Keeping these in one module avoids circular imports between
`runner`, `store`, and the dimension modules.
"""
from __future__ import annotations

import dataclasses
from typing import Any, Literal
from uuid import UUID


RunStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
Verdict = Literal["ok", "regression", "improvement"]
DimensionName = Literal[
    "latency", "throughput", "retrieval_quality", "reasoning_quality", "cost"
]
ProfileKind = Literal["cpu", "db", "trace", "memory"]


ALL_DIMENSIONS: tuple[DimensionName, ...] = (
    "latency",
    "throughput",
    "retrieval_quality",
    "reasoning_quality",
    "cost",
)


@dataclasses.dataclass(frozen=True)
class RunConfig:
    """Inputs to a benchmark invocation.

    Built once at run-start and threaded through the runner + every
    dimension. Frozen so dimensions cannot mutate it.
    """
    dimensions: tuple[DimensionName, ...]
    n_runs: int
    profile_kinds: tuple[ProfileKind, ...] = ()
    baseline_sha: str | None = None
    notes: str | None = None
    triggered_by: str = "cli:local"
    update_baseline: bool = False

    def __post_init__(self) -> None:
        if self.n_runs < 1:
            raise ValueError(f"n_runs must be >= 1, got {self.n_runs}")
        if not self.dimensions:
            raise ValueError("dimensions must be non-empty")
        for d in self.dimensions:
            if d not in ALL_DIMENSIONS:
                raise ValueError(f"unknown dimension: {d}")


@dataclasses.dataclass
class Metric:
    """One measurement produced by a dimension.

    The runner attaches baseline/delta/verdict after the dimension
    returns. Dimensions only fill in name + value + (optional)
    threshold_override; the rest of the diff happens centrally in
    `bench.stats`.
    """
    name: str
    value: float
    # If the dimension wants to override the threshold from
    # bench/thresholds.json, it can set this. Most dimensions leave it None.
    threshold_override: float | None = None
    # Direction the metric improves in. For latency / cost: "lower".
    # For recall / pass_rate / throughput: "higher". Used by
    # bench.stats.is_regression to know which side of a delta is bad.
    higher_is_better: bool = False
    # Optional unit string for the UI ("ms", "ms p95", "$/run", "tokens"…).
    unit: str | None = None

    # Filled in by the runner after diffing against baseline.
    baseline: float | None = None
    delta_abs: float | None = None
    delta_pct: float | None = None
    threshold: float | None = None
    verdict: Verdict = "ok"


@dataclasses.dataclass
class DimensionResult:
    """What a dimension returns to the runner."""
    name: DimensionName
    metrics: list[Metric]
    elapsed_ms: int
    error: str | None = None


@dataclasses.dataclass
class ProfileArtifact:
    """A captured profiling artifact attached to a run."""
    kind: ProfileKind
    artifact_path: str
    summary: dict[str, Any]


@dataclasses.dataclass
class GitContext:
    sha: str
    branch: str
    dirty: bool


@dataclasses.dataclass
class RunSummary:
    """In-memory snapshot of a run while it's executing.

    Persisted into `bench_runs` at start, updated as work progresses,
    finalized at the end. Mirrors the column set of the table.
    """
    id: UUID
    status: RunStatus
    started_at: float            # time.time() at start
    ended_at: float | None
    git: GitContext
    baseline_sha: str | None
    dimensions: tuple[DimensionName, ...]
    profile_kinds: tuple[ProfileKind, ...]
    n_runs: int
    triggered_by: str
    current_stage: str | None
    progress_pct: int
    regressions: int
    improvements: int
    error: str | None
    notes: str | None
