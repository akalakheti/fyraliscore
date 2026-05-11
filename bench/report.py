"""bench/report.py — render a bench run as markdown + JSON.

Reads bench_runs / bench_metrics / bench_profiles for a run_id and
produces:

  bench/reports/<run_id>.md   — human-readable
  bench/reports/<run_id>.json — machine-readable

The markdown layout mirrors what the UI shows in BenchRun.tsx so a
developer reading the file recognizes the structure.
"""
from __future__ import annotations

import datetime
import json
import pathlib
from collections import defaultdict
from typing import Any
from uuid import UUID

import asyncpg

from bench import config as bench_config
from bench import store


def _fmt_value(v: float | None, unit: str | None = None) -> str:
    if v is None:
        return "—"
    if abs(v) >= 100:
        s = f"{v:,.1f}"
    elif abs(v) >= 1:
        s = f"{v:.2f}"
    else:
        s = f"{v:.4f}"
    return f"{s} {unit}" if unit else s


def _fmt_delta_pct(p: float | None) -> str:
    if p is None:
        return "—"
    return f"{p * 100:+.1f}%"


def _verdict_chip(v: str) -> str:
    return {
        "ok": "✓",
        "regression": "✗ REGRESSION",
        "improvement": "↑ improvement",
    }.get(v, v)


async def write_report(
    run_id: UUID,
    *,
    pool: asyncpg.Pool | None = None,
) -> tuple[pathlib.Path, pathlib.Path]:
    """Write both markdown + JSON reports. Returns their paths."""
    run = await store.get_run(run_id, pool=pool)
    if run is None:
        raise ValueError(f"unknown run_id: {run_id}")
    metrics = await store.get_run_metrics(run_id, pool=pool)
    profiles = await store.get_run_profiles(run_id, pool=pool)

    by_dim: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for m in metrics:
        by_dim[m["dimension"]].append(m)

    started = run["started_at"]
    ended = run["ended_at"]
    elapsed = None
    if started and ended:
        elapsed = (ended - started).total_seconds()

    lines: list[str] = []
    lines.append(f"# Bench Run `{run_id}`")
    lines.append("")
    lines.append(f"- Status: **{run['status']}**")
    lines.append(f"- Branch: `{run['git_branch']}` @ `{run['git_sha'][:10]}`"
                 f"{' (dirty)' if run['git_dirty'] else ''}")
    if run["baseline_sha"]:
        lines.append(f"- Baseline SHA: `{run['baseline_sha'][:10]}`")
    lines.append(f"- Triggered by: `{run['triggered_by']}`")
    lines.append(f"- Dimensions: {', '.join(run['dimensions'])}")
    if run["profile_kinds"]:
        lines.append(f"- Profiles captured: {', '.join(run['profile_kinds'])}")
    lines.append(f"- Started: {started}")
    if elapsed is not None:
        lines.append(f"- Elapsed: {elapsed:.1f}s")
    lines.append(
        f"- Verdict counts: "
        f"**{run['regressions']} regressions**, "
        f"**{run['improvements']} improvements**"
    )
    if run["notes"]:
        lines.append(f"- Notes: {run['notes']}")
    if run["error"]:
        lines.append(f"- ⚠ Error: `{run['error']}`")
    lines.append("")

    for dim, ms in by_dim.items():
        lines.append(f"## {dim}")
        lines.append("")
        lines.append("| Metric | Baseline | Current | Δ abs | Δ % | Threshold | Verdict |")
        lines.append("|---|---|---|---|---|---|---|")
        for m in ms:
            lines.append(
                f"| `{m['metric']}` "
                f"| {_fmt_value(m['baseline'])} "
                f"| {_fmt_value(m['value'])} "
                f"| {_fmt_value(m['delta_abs'])} "
                f"| {_fmt_delta_pct(m['delta_pct'])} "
                f"| {_fmt_value(m['threshold'])} "
                f"| {_verdict_chip(m['verdict'])} |"
            )
        lines.append("")

    if profiles:
        lines.append("## Profiles")
        lines.append("")
        for prof in profiles:
            lines.append(
                f"- **{prof['kind']}** — `{prof['artifact_path']}`"
            )
            if prof["summary"]:
                summary_str = json.dumps(prof["summary"], default=str)[:200]
                lines.append(f"  - summary: {summary_str}")
        lines.append("")

    md_path = bench_config.REPORTS_DIR / f"{run_id}.md"
    json_path = bench_config.REPORTS_DIR / f"{run_id}.json"
    bench_config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    md_path.write_text("\n".join(lines))
    json_path.write_text(json.dumps({
        "run": {k: _json_safe(v) for k, v in run.items()},
        "metrics": [
            {k: _json_safe(v) for k, v in m.items()} for m in metrics
        ],
        "profiles": [
            {k: _json_safe(v) for k, v in p.items()} for p in profiles
        ],
        "rendered_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, indent=2, default=str))
    return md_path, json_path


def _json_safe(v: Any) -> Any:
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    return v
