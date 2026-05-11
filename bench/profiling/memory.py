"""bench/profiling/memory.py — tracemalloc snapshot diff (opt-in).

Captures a `tracemalloc` snapshot before and after the benchmark
runs, diffs them, and stores the top-50 allocators that grew the
most. Useful for finding leaks in worker queues, cascade BFS, or
topology recompute paths.

tracemalloc has nontrivial overhead. Opt-in only.
"""
from __future__ import annotations

import contextlib
import json
import tracemalloc
from typing import Any
from uuid import UUID

from bench import config as bench_config
from bench.types import ProfileArtifact


class MemoryProfiler:
    kind = "memory"

    def __init__(self) -> None:
        self._before: tracemalloc.Snapshot | None = None
        self._after: tracemalloc.Snapshot | None = None

    @contextlib.contextmanager
    def capture(self, run_id: UUID):
        started_here = False
        if not tracemalloc.is_tracing():
            tracemalloc.start()
            started_here = True
        self._before = tracemalloc.take_snapshot()
        try:
            yield self
        finally:
            self._after = tracemalloc.take_snapshot()
            if started_here:
                with contextlib.suppress(Exception):
                    tracemalloc.stop()

    def write(self, run_id: UUID) -> ProfileArtifact:
        assert self._after is not None
        diffs = []
        top_allocator: dict[str, Any] | None = None
        delta_total = 0
        if self._before is not None:
            stats = self._after.compare_to(self._before, "lineno")[:50]
            for s in stats:
                diffs.append({
                    "size": s.size,
                    "size_diff": s.size_diff,
                    "count": s.count,
                    "count_diff": s.count_diff,
                    "traceback": [str(f) for f in s.traceback.format()],
                })
                delta_total += int(s.size_diff or 0)
            if stats:
                top = stats[0]
                top_allocator = {
                    "size_diff": top.size_diff,
                    "traceback": str(top.traceback)[:200],
                }

        out_dir = bench_config.ARTIFACTS_DIR / str(run_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "memory.json"
        path.write_text(json.dumps({"top_allocators": diffs}, indent=2))

        summary = {
            "delta_mb": round(delta_total / (1024 * 1024), 2),
            "top_allocator": top_allocator,
        }
        return ProfileArtifact(
            kind="memory",
            artifact_path=str(path.relative_to(bench_config.REPO_ROOT)),
            summary=summary,
        )
