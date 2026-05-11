"""services/gateway/bench_routes.py — FastAPI router for the /v1/bench/* surface.

Backs the UI at ui/src/pages/Bench.tsx and friends. Endpoints are split
between read (list / detail / trends / profile artifact) and write
(trigger / cancel / save-as-baseline) plus a small `estimate` helper
the form uses to show projected wall-clock time.

The trigger endpoint kicks off `bench.runner.execute_run` in an
`asyncio.create_task` and returns the run_id immediately. Live progress
goes out over the WebSocket route registered in `bench_ws.py` (next
build step) which forwards LISTEN/NOTIFY payloads from the runner.

Concurrency guard: at most one running benchmark per instance. Enforced
both at the SQL level (partial unique index on bench_runs) and here
(POST returns 409 if `bench_runs.status='running'` is found).
"""
from __future__ import annotations

import asyncio
import json
import logging
import pathlib
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator

from bench import config as bench_config
from bench import store as bench_store
from bench.runner import execute_run, request_cancel
from bench.types import ALL_DIMENSIONS, RunConfig


log = logging.getLogger("gateway.bench")

bench_router = APIRouter(prefix="/v1/bench", tags=["bench"])


# Public path prefixes — the bench surface is gated by the same auth
# middleware as the rest of the UI but exposed under /v1/bench/*.
PUBLIC_BENCH_PREFIXES: tuple[str, ...] = ()


# ---------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------


class TriggerRunRequest(BaseModel):
    dimensions: list[str] = Field(default_factory=list)
    runs: int = Field(default=5, ge=1, le=20)
    profile_kinds: list[str] = Field(default_factory=list)
    baseline_sha: str | None = None
    notes: str | None = None

    @field_validator("dimensions")
    @classmethod
    def _check_dims(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("dimensions must be non-empty")
        for d in v:
            if d not in ALL_DIMENSIONS:
                raise ValueError(f"unknown dimension: {d}")
        return v

    @field_validator("profile_kinds")
    @classmethod
    def _check_profiles(cls, v: list[str]) -> list[str]:
        allowed = {"cpu", "db", "trace", "memory"}
        for p in v:
            if p not in allowed:
                raise ValueError(f"unknown profile kind: {p}")
        return v


class EstimateResponse(BaseModel):
    min_seconds: int
    max_seconds: int


class SaveBaselineRequest(BaseModel):
    run_id: UUID


# ---------------------------------------------------------------------
# Estimate helper — used by BenchNew.tsx to show projected wall-clock.
# ---------------------------------------------------------------------

_PER_DIM_SECONDS: dict[str, tuple[int, int]] = {
    # (min_per_run, max_per_run)
    "latency": (3, 8),
    "throughput": (10, 30),
    "retrieval_quality": (5, 15),
    "reasoning_quality": (20, 90),
    "cost": (1, 3),
}
_PER_PROFILE_OVERHEAD_SECONDS: dict[str, tuple[int, int]] = {
    "cpu": (5, 15),
    "db": (3, 10),
    "trace": (2, 5),
    "memory": (5, 15),
}


def _estimate_seconds(dims: list[str], runs: int, profile_kinds: list[str]) -> tuple[int, int]:
    lo = hi = 0
    for d in dims:
        a, b = _PER_DIM_SECONDS.get(d, (3, 10))
        lo += a * runs
        hi += b * runs
    for p in profile_kinds:
        a, b = _PER_PROFILE_OVERHEAD_SECONDS.get(p, (2, 5))
        lo += a
        hi += b
    return lo, hi


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------


@bench_router.get("/runs")
async def list_runs(request: Request, limit: int = 20) -> JSONResponse:
    pool = _pool(request)
    limit = max(1, min(200, limit))
    rows = await bench_store.list_recent_runs(limit=limit, pool=pool)
    return JSONResponse(content=_jsonable({"runs": rows}))


@bench_router.get("/runs/{run_id}")
async def get_run(request: Request, run_id: UUID) -> JSONResponse:
    pool = _pool(request)
    run = await bench_store.get_run(run_id, pool=pool)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    metrics = await bench_store.get_run_metrics(run_id, pool=pool)
    profiles = await bench_store.get_run_profiles(run_id, pool=pool)
    return JSONResponse(content=_jsonable({
        "run": run,
        "metrics": metrics,
        "profiles": profiles,
    }))


@bench_router.get("/runs/{run_id}/profiles/{kind}")
async def get_profile_artifact(request: Request, run_id: UUID, kind: str) -> Any:
    pool = _pool(request)
    profiles = await bench_store.get_run_profiles(run_id, pool=pool)
    match = next((p for p in profiles if p["kind"] == kind), None)
    if match is None:
        raise HTTPException(status_code=404, detail="profile not found")
    artifact_path = pathlib.Path(match["artifact_path"])
    if not artifact_path.is_absolute():
        artifact_path = bench_config.REPO_ROOT / artifact_path
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="artifact file missing")
    # Guard against path traversal — must stay under bench/artifacts/.
    try:
        artifact_path.relative_to(bench_config.ARTIFACTS_DIR)
    except ValueError:
        raise HTTPException(status_code=400, detail="artifact path escapes bench/artifacts/")
    return FileResponse(artifact_path, media_type="application/json")


@bench_router.get("/trends")
async def get_trends(
    request: Request,
    metric: str,
    dimension: str,
    n: int = 50,
) -> JSONResponse:
    pool = _pool(request)
    n = max(1, min(500, n))
    rows = await bench_store.trends_for_metric(
        dimension, metric, limit=n, pool=pool
    )
    return JSONResponse(content=_jsonable({"points": rows}))


@bench_router.get("/estimate")
async def estimate(
    dimensions: str,
    runs: int = 5,
    profile: str = "",
) -> EstimateResponse:
    dims = [d for d in dimensions.split(",") if d]
    profs = [p for p in profile.split(",") if p]
    lo, hi = _estimate_seconds(dims, runs, profs)
    return EstimateResponse(min_seconds=lo, max_seconds=hi)


@bench_router.post("/runs", status_code=status.HTTP_202_ACCEPTED)
async def trigger_run(request: Request, body: TriggerRunRequest) -> JSONResponse:
    pool = _pool(request)

    # Concurrency guard.
    running = await bench_store.find_running_run(pool=pool)
    if running:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": "another benchmark is in progress",
                "running_run_id": str(running["id"]),
                "current_stage": running.get("current_stage"),
                "progress_pct": running.get("progress_pct"),
            },
        )

    actor_email = getattr(request.state, "actor_email", None) or "unknown"
    cfg = RunConfig(
        dimensions=tuple(body.dimensions),  # type: ignore[arg-type]
        n_runs=body.runs,
        profile_kinds=tuple(body.profile_kinds),  # type: ignore[arg-type]
        baseline_sha=body.baseline_sha,
        notes=body.notes,
        triggered_by=f"ui:{actor_email}",
    )

    # Kick off as a background task so the HTTP request returns immediately.
    task = asyncio.create_task(execute_run(cfg, pool=pool))
    # Wait for the runner to insert the row so we can return the id.
    # Brief poll loop — execute_run inserts within a few ms of starting.
    run_id = None
    for _ in range(50):
        await asyncio.sleep(0.02)
        recent = await bench_store.list_recent_runs(limit=1, pool=pool)
        if recent and recent[0]["triggered_by"] == cfg.triggered_by:
            run_id = recent[0]["id"]
            break
        if task.done() and task.exception() is not None:
            raise HTTPException(
                status_code=500,
                detail=f"runner failed: {task.exception()}",
            )
    if run_id is None:
        # The runner is slow to start but the request is still valid.
        # Return 202 with no body; the UI will refetch the run list.
        return JSONResponse(
            status_code=202,
            content={"run_id": None, "warning": "run scheduled; id not yet visible"},
        )
    return JSONResponse(content={"run_id": str(run_id)})


@bench_router.post("/runs/{run_id}/cancel")
async def cancel_run(request: Request, run_id: UUID) -> JSONResponse:
    pool = _pool(request)
    run = await bench_store.get_run(run_id, pool=pool)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    if run["status"] not in ("queued", "running"):
        return JSONResponse(
            content={"cancelled": False, "reason": f"run is {run['status']}"}
        )
    ok = await request_cancel(run_id)
    return JSONResponse(content={"cancelled": ok})


@bench_router.post("/baselines")
async def save_baseline(request: Request, body: SaveBaselineRequest) -> JSONResponse:
    pool = _pool(request)
    run = await bench_store.get_run(body.run_id, pool=pool)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    if run["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"run is {run['status']}, only completed runs can become baselines",
        )
    metrics = await bench_store.get_run_metrics(body.run_id, pool=pool)
    # Group by dimension and write one baseline file per dimension.
    by_dim: dict[str, dict[str, float]] = {}
    for m in metrics:
        by_dim.setdefault(m["dimension"], {})[m["metric"]] = float(m["value"])

    written: list[str] = []
    for dim, vals in by_dim.items():
        p = bench_config.save_baseline(dim, {"metrics": vals, "run_id": str(body.run_id)})
        written.append(str(p.relative_to(bench_config.REPO_ROOT)))
    return JSONResponse(content={"files": written})


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------


def _pool(request: Request):
    deps = getattr(request.app.state, "deps", None)
    if deps is None or deps.pool is None:
        raise HTTPException(status_code=503, detail="gateway not ready (no pool)")
    return deps.pool


def _jsonable(o: Any) -> Any:
    """Recursively convert UUIDs / datetimes / asyncpg.Records to JSON-safe types."""
    import datetime
    from uuid import UUID as _UUID

    if isinstance(o, _UUID):
        return str(o)
    if isinstance(o, datetime.datetime):
        return o.isoformat()
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    return o
