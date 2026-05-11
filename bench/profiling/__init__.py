"""bench/profiling/ — opt-in diagnostic capture during a benchmark run.

Profiling answers *why* something is slow. Capture is opt-in via the
`--profile` CLI flag or the BenchNew.tsx profile chips because the
overhead would distort the latency measurements if always on.

Every profiler:
  - exposes `capture(run_id, pool) -> ProfileArtifact` as an async ctx
    manager wrapping the work to be profiled
  - writes its artifact under bench/artifacts/<run_id>/
  - returns a ProfileArtifact with a small JSON summary suitable for
    the dashboard card preview
"""
from __future__ import annotations

from bench.profiling.cpu import CPUProfiler
from bench.profiling.db import DBProfiler
from bench.profiling.memory import MemoryProfiler
from bench.profiling.trace import TraceProfiler


def get_profiler(kind: str):
    if kind == "cpu":
        return CPUProfiler()
    if kind == "db":
        return DBProfiler()
    if kind == "trace":
        return TraceProfiler()
    if kind == "memory":
        return MemoryProfiler()
    raise ValueError(f"unknown profile kind: {kind}")
