"""bench/cli.py — `python -m bench` entry point.

Usage:

  python -m bench all                       # all dimensions, compare to baseline
  python -m bench all --update-baseline     # all, overwrite baselines
  python -m bench latency cost              # subset of dimensions
  python -m bench all --runs 10             # override N
  python -m bench all --note "trying X"     # attach a note to the run

The CLI is a thin wrapper around `bench.runner.execute_run`. The
authoritative interface is the UI; the CLI exists for scripted /
power-user use and CI.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import socket
import sys
from typing import Sequence

from bench import config as bench_config
from bench import report as bench_report
from bench.runner import run_once
from bench.types import ALL_DIMENSIONS, RunConfig
from lib.shared.db import close_pool, get_pool


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="bench",
        description="Multi-dimensional benchmarking for Fyraliscore.",
    )
    parser.add_argument(
        "dimensions",
        nargs="+",
        help=f"Dimensions to run, or 'all'. Available: {', '.join(ALL_DIMENSIONS)}.",
    )
    parser.add_argument(
        "--runs", type=int, default=5,
        help="N runs per scenario (default 5).",
    )
    parser.add_argument(
        "--update-baseline", action="store_true",
        help="Overwrite bench/baselines/*.json with this run's values.",
    )
    parser.add_argument(
        "--profile", default="",
        help="Comma-separated profile kinds: cpu, db, trace, memory.",
    )
    parser.add_argument(
        "--note", default=None,
        help="Free-form note attached to the run record.",
    )
    parser.add_argument(
        "--no-report", action="store_true",
        help="Skip writing the markdown / JSON report at the end.",
    )
    return parser.parse_args(argv)


def _resolve_dimensions(args_list: list[str]) -> tuple[str, ...]:
    if args_list == ["all"]:
        return ALL_DIMENSIONS
    for d in args_list:
        if d not in ALL_DIMENSIONS:
            raise SystemExit(
                f"unknown dimension '{d}'. Valid: {', '.join(ALL_DIMENSIONS)} or 'all'."
            )
    return tuple(args_list)


async def _amain(argv: Sequence[str]) -> int:
    args = _parse_args(argv)
    dimensions = _resolve_dimensions(args.dimensions)
    profile_kinds = tuple(
        p.strip() for p in args.profile.split(",") if p.strip()
    )

    cfg = RunConfig(
        dimensions=dimensions,
        n_runs=args.runs,
        profile_kinds=profile_kinds,  # type: ignore[arg-type]
        notes=args.note,
        triggered_by=f"cli:{socket.gethostname()}",
        update_baseline=args.update_baseline,
    )

    dsn = os.environ.get("DATABASE_URL")
    run_id = await run_once(cfg, dsn=dsn)

    if not args.no_report:
        md_path, json_path = await bench_report.write_report(run_id, pool=get_pool())
        print(f"\nReport: {md_path}")
        print(f"JSON:   {json_path}")

    # Print a brief summary so CLI consumers see at-a-glance verdict.
    from bench import store
    run = await store.get_run(run_id, pool=get_pool())
    if run:
        print(
            f"\nrun_id={run_id} status={run['status']} "
            f"regressions={run['regressions']} improvements={run['improvements']}"
        )
        if run["status"] == "completed" and run["regressions"] > 0:
            return 2
        if run["status"] in ("failed", "cancelled"):
            return 1

    return 0


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(argv) if argv is not None else sys.argv[1:]
    try:
        return asyncio.run(_amain(argv))
    finally:
        try:
            asyncio.run(close_pool())
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
