"""bench/profiling/trace.py — Chrome Trace Event Format from structlog events.

Attaches a structlog processor during the benchmark that emits each
event as a Chrome trace event in the format consumable by
chrome://tracing, perfetto, and our own TraceTimeline.tsx component.

Format reference: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/

Each event is `{name, cat, ph, ts, pid, tid, args}`. The processor
groups events by `run_id` (in args) so a single trace.json holds the
spans for every Think run that ran during the benchmark.

For paired begin/end events we emit `ph: "B"` and `ph: "E"` so the
viewer renders them as bars. Single-shot events (informational logs)
get `ph: "i"`.
"""
from __future__ import annotations

import contextlib
import json
import logging
import threading
import time
from typing import Any
from uuid import UUID

from bench import config as bench_config
from bench.types import ProfileArtifact


log = logging.getLogger("bench.profiling.trace")


# Events to convert to "B"/"E" pairs by matching prefix. The structlog
# events emitted by services/think/observability.py use these names.
_BEGIN_EVENTS = {
    "think.started": ("think_run", "think"),
    "think.retrieval_done": ("retrieval", "retrieval"),
    "think.validation_done": ("validation", "validation"),
    "think.apply_done": ("apply", "apply"),
}
_END_EVENTS = {
    "think.retrieval_done": "think_run",
    "think.committed": "apply",
}


class TraceProfiler:
    kind = "trace"

    def __init__(self) -> None:
        self._events: list[dict[str, Any]] = []
        self._t0_us: int = 0
        self._lock = threading.Lock()
        self._processor = None
        self._removed = False

    @contextlib.contextmanager
    def capture(self, run_id: UUID):
        # Install a structlog processor that converts events to
        # chrome-trace format. The processor is appended to the global
        # configured chain at start, removed at end.
        try:
            import structlog
            from structlog._config import _CONFIG  # type: ignore[attr-defined]
        except Exception:
            yield self
            return

        self._t0_us = int(time.time() * 1_000_000)

        def processor(_logger, _method_name, event_dict):
            # Don't recurse into our own events.
            try:
                self._record(event_dict)
            except Exception:
                pass
            return event_dict

        self._processor = processor
        try:
            current = _CONFIG.default_processors  # type: ignore[attr-defined]
            new_chain = list(current) + [processor]
            structlog.configure(processors=new_chain)
        except Exception:
            pass

        try:
            yield self
        finally:
            try:
                import structlog
                from structlog._config import _CONFIG  # type: ignore[attr-defined]
                current = _CONFIG.default_processors  # type: ignore[attr-defined]
                new_chain = [p for p in current if p is not processor]
                structlog.configure(processors=new_chain)
                self._removed = True
            except Exception:
                pass

    def _record(self, event_dict: dict[str, Any]) -> None:
        event_name = event_dict.get("event") or "_"
        if not isinstance(event_name, str):
            return
        ts_us = int(time.time() * 1_000_000) - self._t0_us
        run_id = (
            event_dict.get("trigger_id")
            or event_dict.get("run_id")
            or event_dict.get("think_run_id")
            or "unknown"
        )
        tid = str(run_id)[-8:]
        scoped = dict(event_dict)
        scoped.pop("event", None)
        # Default to instantaneous event.
        ph = "i"
        cat = "think"
        name = event_name
        if event_name in _BEGIN_EVENTS:
            name, cat = _BEGIN_EVENTS[event_name]
            ph = "B"
        elif event_name in _END_EVENTS:
            name = _END_EVENTS[event_name]
            cat = name
            ph = "E"
        with self._lock:
            self._events.append({
                "name": name,
                "cat": cat,
                "ph": ph,
                "ts": ts_us,
                "pid": 1,
                "tid": tid,
                "args": {k: v for k, v in scoped.items() if _safe(v)},
            })

    def write(self, run_id: UUID) -> ProfileArtifact:
        out_dir = bench_config.ARTIFACTS_DIR / str(run_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "trace.json"
        doc = {
            "traceEvents": self._events,
            "displayTimeUnit": "ms",
        }
        path.write_text(json.dumps(doc, default=str))

        # Compute a quick summary for the dashboard card.
        runs_seen = set()
        max_span_us = 0
        per_run_first: dict[str, int] = {}
        per_run_last: dict[str, int] = {}
        for e in self._events:
            tid = e.get("tid") or ""
            runs_seen.add(tid)
            ts = int(e.get("ts") or 0)
            if tid not in per_run_first:
                per_run_first[tid] = ts
            per_run_last[tid] = ts
        for tid in runs_seen:
            span = per_run_last[tid] - per_run_first[tid]
            if span > max_span_us:
                max_span_us = span

        summary = {
            "think_runs": len(runs_seen),
            "events": len(self._events),
            "max_span_ms": max_span_us / 1000.0,
        }
        return ProfileArtifact(
            kind="trace",
            artifact_path=str(path.relative_to(bench_config.REPO_ROOT)),
            summary=summary,
        )


def _safe(v: Any) -> bool:
    """Skip args that won't JSON-encode cleanly."""
    return isinstance(v, (str, int, float, bool)) or v is None
