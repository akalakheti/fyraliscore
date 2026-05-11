"""bench/profiling/cpu.py — cProfile capture + speedscope JSON export.

Wraps a block of work in `cProfile.Profile()`, then converts the
resulting stats into speedscope's `evented` profile format which the
in-repo FlameGraph.tsx component renders as an icicle chart.

Speedscope reference: https://github.com/jlfwong/speedscope/wiki/Importing-from-custom-sources

The conversion path uses `pstats` to walk the call graph and emits a
flat list of (function, time) plus a single synthetic "self" sample
per function. This is a simplified profile — it captures total time
per function rather than a true call-stack tree — but it is enough
to surface hot functions in the flame-graph UI.

A future enhancement can swap to `pyinstrument`'s tree output or
`py-spy`'s native speedscope export for richer call-stack data.
"""
from __future__ import annotations

import contextlib
import cProfile
import json
import pathlib
import pstats
import time
from typing import Any
from uuid import UUID

from bench import config as bench_config
from bench.types import ProfileArtifact


class CPUProfiler:
    kind = "cpu"

    def __init__(self) -> None:
        self._profile: cProfile.Profile | None = None
        self._t_start: float = 0.0

    @contextlib.contextmanager
    def capture(self, run_id: UUID):
        self._profile = cProfile.Profile()
        self._t_start = time.perf_counter()
        self._profile.enable()
        try:
            yield self
        finally:
            self._profile.disable()

    def write(self, run_id: UUID) -> ProfileArtifact:
        assert self._profile is not None, "capture() must be called first"
        out_dir = bench_config.ARTIFACTS_DIR / str(run_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        prof_path = out_dir / "cpu.prof"
        speedscope_path = out_dir / "cpu.speedscope.json"

        # Dump raw cProfile output for offline drilling.
        self._profile.dump_stats(str(prof_path))

        stats = pstats.Stats(self._profile)
        stats.sort_stats(pstats.SortKey.CUMULATIVE)

        # Build speedscope "evented" profile from per-function totals.
        frames: list[dict[str, str]] = []
        frame_index: dict[str, int] = {}
        events: list[dict[str, Any]] = []
        t_cursor = 0.0

        # Iterate ordered by cumulative time.
        ordered = sorted(
            stats.stats.items(),  # type: ignore[attr-defined]
            key=lambda kv: kv[1][3],  # cumulative time
            reverse=True,
        )[:200]  # top 200 frames is plenty for the flame view

        top_funcs: list[dict[str, Any]] = []
        for (file_, lineno, fn), (cc, nc, tt, ct, _callers) in ordered:
            label = f"{fn} ({pathlib.Path(file_).name}:{lineno})"
            if label not in frame_index:
                frame_index[label] = len(frames)
                frames.append({"name": label})
            idx = frame_index[label]
            # Approximate the function as one open/close pair of
            # duration `tt` (own time). Stacked end-to-end on a single
            # timeline.
            events.append({"type": "O", "frame": idx, "at": t_cursor})
            t_cursor += max(tt, 1e-9)
            events.append({"type": "C", "frame": idx, "at": t_cursor})
            top_funcs.append({
                "name": label,
                "self_time_s": tt,
                "cumulative_time_s": ct,
                "calls": nc,
            })

        wall_s = time.perf_counter() - self._t_start
        speedscope_doc = {
            "$schema": "https://www.speedscope.app/file-format-schema.json",
            "exporter": "bench/profiling/cpu.py",
            "name": f"bench-run-{run_id}",
            "activeProfileIndex": 0,
            "profiles": [
                {
                    "type": "evented",
                    "name": "cProfile (own time, simplified)",
                    "unit": "seconds",
                    "startValue": 0,
                    "endValue": t_cursor,
                    "events": events,
                }
            ],
            "shared": {"frames": frames},
        }
        speedscope_path.write_text(json.dumps(speedscope_doc))

        summary = {
            "wall_s": round(wall_s, 4),
            "n_frames": len(frames),
            "top_funcs": top_funcs[:10],
        }
        return ProfileArtifact(
            kind="cpu",
            artifact_path=str(speedscope_path.relative_to(bench_config.REPO_ROOT)),
            summary=summary,
        )
