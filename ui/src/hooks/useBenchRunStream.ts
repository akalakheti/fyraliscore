import { useEffect, useRef, useState } from "react";

// useBenchRunStream — subscribe to /stream/bench/runs/:id and return
// the live snapshot of a run as the gateway pushes updates.
//
// The WebSocket sends a sequence of frames:
//   { kind: "snapshot",   run: { ...full run row from bench_runs } }
//   { kind: "progress",   status?, current_stage?, progress_pct?, error?, regressions?, improvements? }
//   { kind: "heartbeat" }
//   { kind: "terminal",   status: "completed" | "failed" | "cancelled" }
//   { kind: "error",      message: string }
//
// The hook merges snapshot + progress frames into a single live state
// object that consumers render.

export interface LiveRunState {
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "unknown";
  current_stage: string | null;
  progress_pct: number;
  regressions: number;
  improvements: number;
  error: string | null;
  connected: boolean;
  terminal: boolean;
  lastEventAt: number | null;
}

const INITIAL: LiveRunState = {
  status: "unknown",
  current_stage: null,
  progress_pct: 0,
  regressions: 0,
  improvements: 0,
  error: null,
  connected: false,
  terminal: false,
  lastEventAt: null,
};

export function useBenchRunStream(runId: string | undefined): LiveRunState {
  const [state, setState] = useState<LiveRunState>(INITIAL);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!runId) return;
    setState(INITIAL);

    // Vite dev proxies /stream to the gateway. Build the absolute URL
    // using window.location so both dev (proxied) and prod (same-origin)
    // work without configuration.
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/stream/bench/runs/${encodeURIComponent(runId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      setState((s) => mergeFrame(s, msg));
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
    };

    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [runId]);

  return state;
}

function mergeFrame(prev: LiveRunState, msg: Record<string, unknown>): LiveRunState {
  const kind = msg.kind as string | undefined;
  const next: LiveRunState = { ...prev, lastEventAt: Date.now() };
  if (kind === "snapshot") {
    const run = msg.run as Record<string, unknown> | undefined;
    if (run) {
      next.status = (run.status as LiveRunState["status"]) ?? "unknown";
      next.current_stage =
        (run.current_stage as string | null | undefined) ?? null;
      next.progress_pct =
        typeof run.progress_pct === "number" ? (run.progress_pct as number) : 0;
      next.regressions =
        typeof run.regressions === "number" ? (run.regressions as number) : 0;
      next.improvements =
        typeof run.improvements === "number"
          ? (run.improvements as number)
          : 0;
      next.error = (run.error as string | null | undefined) ?? null;
      next.terminal =
        next.status === "completed" ||
        next.status === "failed" ||
        next.status === "cancelled";
    }
    return next;
  }
  if (kind === "progress") {
    if (typeof msg.status === "string") {
      next.status = msg.status as LiveRunState["status"];
    }
    if (typeof msg.current_stage === "string" || msg.current_stage === null) {
      next.current_stage = (msg.current_stage as string | null) ?? next.current_stage;
    }
    if (typeof msg.progress_pct === "number") {
      next.progress_pct = msg.progress_pct as number;
    }
    if (typeof msg.regressions === "number") {
      next.regressions = msg.regressions as number;
    }
    if (typeof msg.improvements === "number") {
      next.improvements = msg.improvements as number;
    }
    if (typeof msg.error === "string") {
      next.error = msg.error as string;
    }
    next.terminal =
      next.status === "completed" ||
      next.status === "failed" ||
      next.status === "cancelled";
    return next;
  }
  if (kind === "terminal") {
    if (typeof msg.status === "string") {
      next.status = msg.status as LiveRunState["status"];
    }
    next.terminal = true;
    return next;
  }
  if (kind === "error") {
    if (typeof msg.message === "string") {
      next.error = msg.message as string;
    }
    return next;
  }
  return next;
}
