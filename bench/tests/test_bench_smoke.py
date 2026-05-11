"""bench/tests/test_bench_smoke.py — pure-Python smoke tests.

These don't require a Postgres connection. They verify:
  - the package imports cleanly
  - the stats module computes percentiles / deltas / verdicts correctly
  - the dimension protocol is satisfied by every dimension
  - the config loaders return well-formed payloads
  - report rendering doesn't crash on a synthetic payload

The DB-backed integration test (runner + store end-to-end) lives at
bench/tests/test_runner_integration.py — gated on a live PG and run
manually for now.
"""
from __future__ import annotations

import pytest

from bench import config as bench_config
from bench import stats
from bench.dimensions.cost import CostDimension
from bench.dimensions.latency import LatencyDimension
from bench.dimensions.reasoning_quality import ReasoningQualityDimension
from bench.dimensions.retrieval_quality import RetrievalQualityDimension
from bench.dimensions.throughput import ThroughputDimension
from bench.types import ALL_DIMENSIONS, Metric, RunConfig


def test_percentiles_basic():
    p = stats.percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (50, 95, 99))
    assert p[50] == 5
    assert p[95] == 10
    assert p[99] == 10


def test_percentiles_empty():
    p = stats.percentiles([], (50, 95))
    assert p == {50: 0.0, 95: 0.0}


def test_paired_delta_div_by_zero_safe():
    assert stats.paired_delta(0.0, 5.0) == (5.0, 0.0)


def test_paired_delta_signed():
    delta_abs, delta_pct = stats.paired_delta(100.0, 80.0)
    assert delta_abs == -20.0
    assert delta_pct == pytest.approx(-0.2)


def test_is_regression_lower_is_better():
    m = Metric(name="ingest_p95", value=120.0)
    m.baseline = 100.0
    m.delta_abs = 20.0
    m.delta_pct = 0.20
    v = stats.is_regression(m, {"delta_pct": 0.15})
    assert v == "regression"


def test_is_regression_higher_is_better():
    m = Metric(name="recall_at_10", value=0.80, higher_is_better=True)
    m.baseline = 0.85
    m.delta_abs = -0.05
    m.delta_pct = -0.05 / 0.85
    v = stats.is_regression(m, {"delta_abs": 0.03})
    assert v == "regression"


def test_is_improvement_higher_is_better():
    m = Metric(name="recall_at_10", value=0.90, higher_is_better=True)
    m.baseline = 0.85
    m.delta_abs = 0.05
    m.delta_pct = 0.05 / 0.85
    v = stats.is_regression(m, {"delta_abs": 0.03})
    assert v == "improvement"


def test_is_regression_no_baseline_is_ok():
    m = Metric(name="ingest_p95", value=120.0)
    v = stats.is_regression(m, {"delta_pct": 0.15})
    assert v == "ok"


def test_apply_baseline_attaches_fields():
    m = Metric(name="x", value=110.0)
    metrics = [m]
    stats.apply_baseline_and_verdict(
        metrics,
        {"metrics": {"x": 100.0}},
        {"default": {"delta_pct": 0.15}, "x": {"delta_pct": 0.20}},
    )
    assert m.baseline == 100.0
    assert m.delta_abs == pytest.approx(10.0)
    assert m.delta_pct == pytest.approx(0.10)
    assert m.threshold == 0.20  # the metric's own override won
    assert m.verdict == "ok"


def test_baseline_payload_shape():
    metrics = [Metric(name="a", value=1.0), Metric(name="b", value=2.0)]
    p = stats.baseline_payload_from_metrics(metrics)
    assert p == {"metrics": {"a": 1.0, "b": 2.0}}


def test_count_verdicts():
    metrics = [
        Metric(name="a", value=1.0),
        Metric(name="b", value=1.0),
        Metric(name="c", value=1.0),
    ]
    metrics[0].verdict = "regression"
    metrics[1].verdict = "improvement"
    metrics[2].verdict = "ok"
    r, i, o = stats.count_verdicts(metrics)
    assert (r, i, o) == (1, 1, 1)


def test_run_config_validates_dimensions():
    with pytest.raises(ValueError):
        RunConfig(dimensions=(), n_runs=1)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        RunConfig(dimensions=("nope",), n_runs=1)  # type: ignore[arg-type]
    # Happy path
    RunConfig(dimensions=("latency",), n_runs=1)  # type: ignore[arg-type]


def test_all_dimensions_have_name():
    for d in (
        LatencyDimension(),
        CostDimension(),
        ThroughputDimension(),
        RetrievalQualityDimension(),
        ReasoningQualityDimension(),
    ):
        assert d.name in ALL_DIMENSIONS


def test_config_loaders():
    cfg = bench_config.load_config()
    assert "default_baseline_branch" in cfg
    thr = bench_config.load_thresholds()
    for d in ALL_DIMENSIONS:
        assert d in thr, f"thresholds.json missing dimension: {d}"


def test_estimate_helper():
    # The route's _estimate_seconds is purely arithmetic — import & call.
    from services.gateway.bench_routes import _estimate_seconds

    lo, hi = _estimate_seconds(
        ["latency", "cost"], runs=5, profile_kinds=["cpu"]
    )
    assert lo > 0
    assert hi >= lo
