"""services/gateway/bench_ws.py — WebSocket live progress for bench runs.

Mounted at `/stream/bench/runs/{run_id}`. The handler:

  1. Accepts the connection.
  2. Sends an initial snapshot from `bench_runs` so the client renders
     immediately without waiting for the next NOTIFY.
  3. LISTENs on Postgres channel `bench_run_<id>` (named by
     `bench.store.notify_channel`).
  4. Forwards each NOTIFY payload as a JSON message to the client.
  5. Closes cleanly on disconnect or when the run reaches a terminal
     state.

Vite proxies `/stream` to the gateway already (ui/vite.config.ts) so no
additional client-side config is needed.

Auth is intentionally permissive for the bench surface — the bench is
developer-only tooling and the run_id is already a UUID7. A future
hardening pass (step 10) can require a token query parameter like the
existing /stream endpoint does.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from bench import store as bench_store


log = logging.getLogger("gateway.bench_ws")


def register_bench_ws(app: FastAPI) -> None:
    """Register the bench WS route on the given FastAPI app."""

    @app.websocket("/stream/bench/runs/{run_id}")
    async def bench_run_stream(ws: WebSocket, run_id: UUID) -> None:
        await ws.accept()
        pool = _pool_from_app(ws)
        if pool is None:
            await _safe_send(ws, {"kind": "error", "message": "pool_unavailable"})
            await ws.close(code=1011)
            return

        # Snapshot first so the client paints immediately.
        try:
            initial = await bench_store.get_run(run_id, pool=pool)
        except Exception as e:
            await _safe_send(ws, {"kind": "error", "message": str(e)})
            await ws.close(code=1011)
            return
        if initial is None:
            await _safe_send(ws, {"kind": "error", "message": "run_not_found"})
            await ws.close(code=1008)
            return

        await _safe_send(ws, {
            "kind": "snapshot",
            "run": _jsonable(initial),
        })

        # If the run is already in a terminal state, send a final event
        # and close — the client doesn't need a live channel.
        if initial["status"] in ("completed", "failed", "cancelled"):
            await _safe_send(ws, {"kind": "terminal", "status": initial["status"]})
            await ws.close()
            return

        # Subscribe to the NOTIFY channel. We acquire one dedicated
        # connection from the pool and hold it for the duration of the
        # subscription.
        channel = bench_store.notify_channel(run_id)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=512)
        loop = asyncio.get_running_loop()

        def _on_notify(conn, pid, ch, payload):  # asyncpg callback signature
            try:
                data = json.loads(payload) if payload else {}
            except json.JSONDecodeError:
                data = {"raw": payload}
            # Drop frames on slow consumers rather than blocking the
            # PG read loop.
            try:
                queue.put_nowait({"kind": "progress", **data})
            except asyncio.QueueFull:
                log.warning("bench_ws.queue_full", extra={"run_id": str(run_id)})

        conn: asyncpg.Connection | None = None
        try:
            conn = await pool.acquire()
            await conn.add_listener(channel, _on_notify)

            # Heartbeat: every 15s send an idle frame so proxies don't
            # close the connection during a long quiet phase.
            heartbeat_task = asyncio.create_task(_heartbeat(ws))

            try:
                while True:
                    # await either a queued NOTIFY or a client disconnect.
                    receive_task = asyncio.create_task(ws.receive_text())
                    queue_task = asyncio.create_task(queue.get())
                    done, pending = await asyncio.wait(
                        {receive_task, queue_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for t in pending:
                        t.cancel()
                    if receive_task in done:
                        # Client sent something (or disconnected). For the
                        # bench WS we don't expect inbound messages; treat
                        # anything received as a ping/no-op. Disconnects
                        # raise inside .result().
                        try:
                            _ = receive_task.result()
                        except WebSocketDisconnect:
                            break
                        # Drop received frame, continue.
                    if queue_task in done:
                        evt = queue_task.result()
                        await _safe_send(ws, evt)
                        # Close if we just emitted a terminal status.
                        if evt.get("status") in ("completed", "failed", "cancelled"):
                            await _safe_send(ws, {
                                "kind": "terminal",
                                "status": evt["status"],
                            })
                            break
            finally:
                heartbeat_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await heartbeat_task
        except WebSocketDisconnect:
            pass
        except Exception as e:
            log.exception("bench_ws.error", extra={"run_id": str(run_id)})
            await _safe_send(ws, {"kind": "error", "message": str(e)})
        finally:
            if conn is not None:
                with contextlib.suppress(Exception):
                    await conn.remove_listener(channel, _on_notify)
                with contextlib.suppress(Exception):
                    await pool.release(conn)
            with contextlib.suppress(Exception):
                await ws.close()


async def _heartbeat(ws: WebSocket) -> None:
    while True:
        await asyncio.sleep(15)
        await _safe_send(ws, {"kind": "heartbeat"})


async def _safe_send(ws: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(payload, default=str))
    except Exception:
        # Send may fail after disconnect; the outer handler closes the WS.
        pass


def _pool_from_app(ws: WebSocket) -> asyncpg.Pool | None:
    deps = getattr(ws.app.state, "deps", None)
    return getattr(deps, "pool", None) if deps else None


def _jsonable(o: Any) -> Any:
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
