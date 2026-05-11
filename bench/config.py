"""bench/config.py — load bench/config.json and bench/thresholds.json.

These two files are committed to the repo. Config controls behavior
(default baseline branch, scenario counts, etc.); thresholds control
regression detection (per-metric tolerance bands).
"""
from __future__ import annotations

import json
import pathlib
from typing import Any

BENCH_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = BENCH_DIR.parent

CONFIG_PATH = BENCH_DIR / "config.json"
THRESHOLDS_PATH = BENCH_DIR / "thresholds.json"
BASELINES_DIR = BENCH_DIR / "baselines"
ARTIFACTS_DIR = BENCH_DIR / "artifacts"
REPORTS_DIR = BENCH_DIR / "reports"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return _DEFAULT_CONFIG
    return json.loads(CONFIG_PATH.read_text())


def load_thresholds() -> dict[str, Any]:
    if not THRESHOLDS_PATH.exists():
        return _DEFAULT_THRESHOLDS
    return json.loads(THRESHOLDS_PATH.read_text())


def baseline_path(dimension: str) -> pathlib.Path:
    return BASELINES_DIR / f"{dimension}.json"


def load_baseline(dimension: str) -> dict[str, Any] | None:
    """Return the baseline JSON for a dimension, or None if absent."""
    p = baseline_path(dimension)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def save_baseline(dimension: str, payload: dict[str, Any]) -> pathlib.Path:
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    p = baseline_path(dimension)
    p.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return p


_DEFAULT_CONFIG: dict[str, Any] = {
    "default_baseline_branch": "demo-deploy",
    "scenarios_per_dimension": 10,
    "max_concurrent_runs": 1,
}


# Per-metric thresholds. Each entry: { "delta_pct": float, ... }.
# delta_pct is the maximum allowed signed delta as a fraction:
#   latency p95 +0.15 → 15% slower trips regression
#   recall@10 -0.03   → an absolute drop of 0.03 trips regression
# is_regression in bench.stats handles direction by reading
# Metric.higher_is_better.
_DEFAULT_THRESHOLDS: dict[str, Any] = {
    "latency": {
        "default": {"delta_pct": 0.15},
        "ingest_p95": {"delta_pct": 0.15},
        "retrieve_p95": {"delta_pct": 0.15},
        "think_p95": {"delta_pct": 0.20},
    },
    "throughput": {
        "default": {"delta_pct": 0.10},
    },
    "retrieval_quality": {
        "default": {"delta_abs": 0.03},
        "recall_at_10": {"delta_abs": 0.03},
        "ndcg_at_10": {"delta_abs": 0.03},
    },
    "reasoning_quality": {
        "ece": {"delta_abs": 0.05},
        "pass_rate": {"delta_abs": 0.02},
        "default": {"delta_abs": 0.02},
    },
    "cost": {
        "default": {"delta_pct": 0.20},
        "mean_usd_per_run": {"delta_pct": 0.20},
    },
}
