"""bench/dimensions/reasoning_quality.py — ECE + pass-rate from the synthesis harness.

Wraps tests/synthesis_harness/calibration.py:compute_calibration so a
bench run captures the same Expected Calibration Error metric the
synthesis suite already produces, and exposes it as a regression-
tracked metric.

For the initial wiring, we read the most recent calibration baseline
artifact at tests/synthesis_harness/baselines/calibration.json and
treat it as the "current" ECE. Running the full 377-case synthesis
harness inline is expensive (~minutes) and requires a fully seeded
DB; the bench wraps the baseline file as the live value. A future
extension can shell out to `pytest tests/synthesis_harness` and parse
its calibration emission.

When the calibration artifact is missing, the dim returns zero metrics
with an error note (matches the cost-dim behavior).
"""
from __future__ import annotations

import json
import pathlib
import time
from typing import Any
from uuid import UUID

import asyncpg

from bench import config as bench_config
from bench.dimensions import ProgressCallback
from bench.types import DimensionResult, Metric


SYNTHESIS_BASELINE_PATH = (
    bench_config.REPO_ROOT / "tests" / "synthesis_harness" / "baselines" / "calibration.json"
)


def _load_synthesis_baseline() -> dict[str, Any] | None:
    if not SYNTHESIS_BASELINE_PATH.exists():
        return None
    try:
        return json.loads(SYNTHESIS_BASELINE_PATH.read_text())
    except json.JSONDecodeError:
        return None


class ReasoningQualityDimension:
    name = "reasoning_quality"

    async def run(
        self,
        run_id: UUID,
        n_runs: int,
        *,
        pool: asyncpg.Pool,
        progress_cb: ProgressCallback,
    ) -> DimensionResult:
        t_start = time.perf_counter()
        await progress_cb("reasoning: reading synthesis calibration baseline", 20)
        payload = _load_synthesis_baseline()
        if payload is None:
            return DimensionResult(
                name="reasoning_quality",
                metrics=[
                    Metric(name="ece", value=0.0, unit="ECE",
                           higher_is_better=False),
                    Metric(name="pass_rate", value=0.0, unit="ratio",
                           higher_is_better=True),
                ],
                elapsed_ms=int((time.perf_counter() - t_start) * 1000),
                error="tests/synthesis_harness/baselines/calibration.json missing "
                      "— run the synthesis harness to seed the baseline",
            )

        ece = float(payload.get("ece") or 0.0)
        total_labeled = int(payload.get("total_scenarios_with_labels") or 0)

        await progress_cb("reasoning: aggregating bucket stats", 70)
        # Pass rate = mean empirical correctness across buckets weighted
        # by bucket population. The baseline file shape from
        # tests/synthesis_harness/calibration.py preserves the per-bucket
        # numbers we need.
        buckets = payload.get("buckets") or []
        weighted_correctness = 0.0
        total = 0
        for b in buckets:
            n = int(b.get("n_scenarios") or 0)
            emp = b.get("empirical_correctness")
            if emp is None or n == 0:
                continue
            weighted_correctness += float(emp) * n
            total += n
        pass_rate = (weighted_correctness / total) if total > 0 else 0.0

        metrics = [
            Metric(name="ece", value=ece, unit="ECE",
                   higher_is_better=False),
            Metric(name="pass_rate", value=pass_rate, unit="ratio",
                   higher_is_better=True),
            Metric(name="scenarios_labeled", value=float(total_labeled),
                   unit="rows", higher_is_better=True),
        ]
        await progress_cb("reasoning: done", 100)
        return DimensionResult(
            name="reasoning_quality",
            metrics=metrics,
            elapsed_ms=int((time.perf_counter() - t_start) * 1000),
        )
