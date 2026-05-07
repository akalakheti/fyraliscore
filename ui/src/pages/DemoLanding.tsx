import { useCallback, useEffect, useRef, useState } from "react";
import App from "@/App";
import {
  DEMO_LS_KEYS,
  clearDemoSession,
  endDemoSession,
  resetDemoSession,
  saveDemoSession,
  startDemoSession,
} from "@/api/demo-picker-client";

// Pelago is the only company the demo currently ships with, so we
// auto-start a Pelago session on first paint instead of presenting a
// picker. If we ever onboard a second company, restore the picker
// from git history (commit before this change).
const DEFAULT_DEMO_COMPANY_ID = "pelago";

// Root route. With no active demo session, kick off a Pelago demo
// session in the background and render the loading state until it
// resolves; otherwise render the cockpit with the reset/end controls.
// /debug and direct API consumers are unaffected.
export default function DemoLanding() {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(DEMO_LS_KEYS.sessionId)
      : null
  );
  const [busy, setBusy] = useState<"reset" | "end" | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // Guards against React 18 StrictMode double-invoking the effect in
  // dev — without this, two sessions race to mint and one gets
  // orphaned on the backend.
  const startInFlight = useRef(false);

  const onReset = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy("reset");
    setResetMsg("Resetting demo… this takes a few seconds.");
    try {
      await resetDemoSession(sessionId);
      setResetMsg("Demo reset. Reloading…");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setBusy(null);
      setResetMsg(
        err instanceof Error ? `Reset failed: ${err.message}` : "Reset failed."
      );
    }
  }, [sessionId, busy]);

  const onEnd = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy("end");
    try {
      await endDemoSession(sessionId);
    } catch {
      // proceed even if the call fails — wipe local state and let the
      // root route re-mint a fresh session on the next render
    }
    clearDemoSession();
    setSessionId(null);
    setBusy(null);
  }, [sessionId, busy]);

  // Auto-start the Pelago session whenever there's no active session.
  // Re-runs on `retryToken` bumps so the user can recover from a
  // transient backend failure without reloading the page.
  //
  // No `alive`/cancel flag here: under React 18 StrictMode the effect
  // mounts → unmounts → mounts again in dev. A cancel-flag pattern
  // would mark the first request as cancelled and the second mount
  // would short-circuit on `startInFlight`, leaving the resolved
  // session payload nowhere to land. Letting both invocations share
  // the in-flight promise (and absorbing one stray setState on a
  // discarded instance) is the simpler correct shape.
  useEffect(() => {
    if (sessionId) return;
    if (startInFlight.current) return;
    startInFlight.current = true;
    setStartError(null);
    (async () => {
      try {
        const session = await startDemoSession(DEFAULT_DEMO_COMPANY_ID);
        saveDemoSession(session);
        setSessionId(session.session_id);
      } catch (err) {
        setStartError(err instanceof Error ? err.message : "start failed");
      } finally {
        startInFlight.current = false;
      }
    })();
  }, [sessionId, retryToken]);

  if (!sessionId) {
    return (
      <div className="demo-picker-shell">
        <div className="demo-picker-loading">
          <div className="demo-picker-loading-pulse" aria-hidden />
          <h1 className="demo-picker-loading-title">
            Setting up your demo environment…
          </h1>
          <p className="demo-picker-loading-body">
            Loading the company snapshot. This usually takes 5 to 15 seconds.
          </p>
          {startError ? (
            <div className="demo-picker-error">
              Could not start the demo — {startError}
              <div>
                <button
                  type="button"
                  className="demo-session-btn"
                  onClick={() => setRetryToken((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <App />
      <div className="demo-session-bar" role="status">
        <div className="demo-session-actions">
          <button
            type="button"
            className="demo-session-btn"
            onClick={() => void onReset()}
            disabled={busy !== null}
          >
            {busy === "reset" ? "Resetting…" : "Reset"}
          </button>
          <button
            type="button"
            className="demo-session-btn demo-session-btn-end"
            onClick={() => void onEnd()}
            disabled={busy !== null}
          >
            {busy === "end" ? "Ending…" : "End demo"}
          </button>
        </div>
      </div>
      {resetMsg ? <div className="demo-session-toast">{resetMsg}</div> : null}
    </>
  );
}
