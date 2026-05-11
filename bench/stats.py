"""bench/stats.py — percentiles, paired delta, regression decision.

Generalizes the calibration-baseline-diff pattern at
tests/synthesis_harness/calibration.py:266 to arbitrary metrics with
direction-aware thresholds.
"""
from __future__ import annotations

import math
from typing import Any

from bench.types import Metric, Verdict


def percentiles(samples: list[float], ps: tuple[int, ...] = (50, 95, 99)) -> dict[int, float]:
    """Return percentile values for the given p list.

    Uses the nearest-rank method (no interpolation) — fine for the
    sample sizes we have (typically N >= 5 runs × M scenarios).
    Empty input returns 0.0 for every requested p.
    """
    if not samples:
        return {p: 0.0 for p in ps}
    sorted_s = sorted(samples)
    n = len(sorted_s)
    out: dict[int, float] = {}
    for p in ps:
        if p <= 0:
            out[p] = sorted_s[0]
            continue
        if p >= 100:
            out[p] = sorted_s[-1]
            continue
        # nearest-rank: ceil(p/100 * n)
        rank = max(1, math.ceil((p / 100.0) * n))
        out[p] = sorted_s[rank - 1]
    return out


def mean(samples: list[float]) -> float:
    return sum(samples) / len(samples) if samples else 0.0


def paired_delta(baseline: float, current: float) -> tuple[float, float]:
    """Return (delta_abs, delta_pct).

    delta_pct is signed: positive = current > baseline. Returns 0.0 for
    the pct when baseline is exactly zero (to avoid div-by-zero).
    """
    delta_abs = current - baseline
    if baseline == 0:
        return delta_abs, 0.0
    return delta_abs, delta_abs / abs(baseline)


def is_regression(
    metric: Metric,
    threshold_cfg: dict[str, Any],
) -> Verdict:
    """Decide whether `metric` is a regression / improvement / ok.

    `threshold_cfg` is the per-metric entry from thresholds.json, e.g.
    `{"delta_pct": 0.15}` or `{"delta_abs": 0.03}`. If the entry is
    missing, the dimension's "default" entry is used by the caller
    before passing in.

    A regression means the metric moved in the *bad* direction by more
    than the threshold. Improvement = moved in the good direction by
    more than the threshold. Otherwise ok.

    No baseline → "ok" (can't regress without a reference).
    """
    if metric.baseline is None:
        return "ok"

    delta_abs = metric.delta_abs
    delta_pct = metric.delta_pct
    if delta_abs is None or delta_pct is None:
        return "ok"

    # Which kind of threshold applies?
    pct_thr = threshold_cfg.get("delta_pct")
    abs_thr = threshold_cfg.get("delta_abs")

    # Direction-aware: for "higher is better" metrics, a negative delta
    # is bad. For "lower is better" metrics, a positive delta is bad.
    if metric.higher_is_better:
        bad_direction_delta = -delta_abs           # positive => bad
        bad_direction_pct = -delta_pct
    else:
        bad_direction_delta = delta_abs
        bad_direction_pct = delta_pct

    # Decide using whichever threshold is configured.
    if abs_thr is not None:
        if bad_direction_delta > abs_thr:
            return "regression"
        if bad_direction_delta < -abs_thr:
            return "improvement"
        return "ok"
    if pct_thr is not None:
        if bad_direction_pct > pct_thr:
            return "regression"
        if bad_direction_pct < -pct_thr:
            return "improvement"
        return "ok"
    return "ok"


def apply_baseline_and_verdict(
    metrics: list[Metric],
    baseline_payload: dict[str, Any] | None,
    dimension_thresholds: dict[str, Any],
) -> None:
    """Mutate each metric in-place: attach baseline, delta_abs/pct, threshold, verdict.

    `baseline_payload` is the loaded JSON for the dimension, expected
    to have the shape `{"metrics": {"<name>": <value>}}`.
    `dimension_thresholds` is the per-dimension dict from thresholds.json
    with a "default" key for fallthrough.
    """
    baseline_metrics: dict[str, float] = {}
    if baseline_payload:
        baseline_metrics = baseline_payload.get("metrics", {}) or {}

    default_thr = dimension_thresholds.get("default", {})

    for m in metrics:
        bl = baseline_metrics.get(m.name)
        if bl is not None:
            m.baseline = float(bl)
            m.delta_abs, m.delta_pct = paired_delta(m.baseline, m.value)

        thr_cfg = dimension_thresholds.get(m.name, default_thr)
        # Surface the active threshold value on the metric for UI rendering.
        m.threshold = thr_cfg.get("delta_abs") or thr_cfg.get("delta_pct")
        if m.threshold_override is not None:
            m.threshold = m.threshold_override
            thr_cfg = {"delta_abs": m.threshold_override}

        m.verdict = is_regression(m, thr_cfg)


def baseline_payload_from_metrics(metrics: list[Metric]) -> dict[str, Any]:
    """Build the JSON shape a baseline file should have."""
    return {"metrics": {m.name: m.value for m in metrics}}


def count_verdicts(metrics: list[Metric]) -> tuple[int, int, int]:
    """Return (n_regressions, n_improvements, n_ok)."""
    r = sum(1 for m in metrics if m.verdict == "regression")
    i = sum(1 for m in metrics if m.verdict == "improvement")
    o = sum(1 for m in metrics if m.verdict == "ok")
    return r, i, o
