// Today page — Focused Review Mode. Entered via /today/review/:deltaId.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/shell/AppShell";
import { Sidebar } from "@/shell/Sidebar";

import {
  applyDelta,
  delegateDelta,
  getDeltaDetail,
  getDeltaEvidence,
  submitCorrection,
} from "@/api/today-page-client";
import { useTodayPage } from "@/hooks/useTodayPage";
import type {
  ApplyResult,
  CorrectionBody,
  DecisionDelta,
  DelegateBody,
  EvidenceResponse,
} from "@/api/today-page-types";

import { SummaryStrip } from "@/components/today-v2/SummaryStrip";
import { FocusedReviewCard } from "@/components/today-v2/FocusedReviewCard";
import { OtherChangesRail } from "@/components/today-v2/OtherChangesRail";
import { DelegationSheet } from "@/components/today-v2/DelegationSheet";
import { CorrectionSheet } from "@/components/today-v2/CorrectionSheet";
import { EvidenceDrawer } from "@/components/today-v2/EvidenceDrawer";
import { Toast } from "@/components/today-v2/Toast";

import "@/pages/today-v2/styles.css";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; text: string; id: number };

export default function TodayFocusedReview() {
  const { deltaId } = useParams<{ deltaId: string }>();
  const navigate = useNavigate();
  const { data: pageData, refetch: refetchPage } = useTodayPage();

  const [delta, setDelta] = useState<DecisionDelta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // The ordered list of all proposed changes available in the briefing,
  // used to compute "Reviewing X of N" + prev/next.
  const orderedList = useMemo<DecisionDelta[]>(() => {
    if (!pageData) return delta ? [delta] : [];
    const list: DecisionDelta[] = [];
    if (pageData.primaryJudgment) list.push(pageData.primaryJudgment);
    list.push(...pageData.otherChanges);
    if (delta && !list.some((d) => d.id === delta.id)) list.push(delta);
    return list;
  }, [pageData, delta]);

  const currentIndex = useMemo(
    () => orderedList.findIndex((d) => d.id === deltaId),
    [orderedList, deltaId],
  );

  // Load detail when deltaId changes.
  useEffect(() => {
    if (!deltaId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvidence(null);
    getDeltaDetail(deltaId)
      .then((d) => {
        if (cancelled) return;
        setDelta(d);
        // Focus the reviewing heading per spec §16.2.
        window.setTimeout(() => {
          const heading = document.querySelector('[data-testid="focused-reviewing"]') as HTMLElement | null;
          heading?.focus();
        }, 50);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load this proposed change.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deltaId]);

  const showToast = useCallback((kind: ToastKind, text: string) => {
    setToast({ kind, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Keyboard model — spec §16.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (delegateOpen || correctionOpen || evidenceOpen) return;
      if (e.key === "Escape") {
        navigate("/today");
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        goToOffset(1);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "k") {
        goToOffset(-1);
        e.preventDefault();
      } else if (e.key === "e") {
        void openEvidence();
        e.preventDefault();
      } else if (e.key === "a") {
        if (delta?.availableActions.includes("accept")) {
          void handleAccept();
          e.preventDefault();
        }
      } else if (e.key === "d") {
        if (delta?.availableActions.includes("delegate")) {
          setDelegateOpen(true);
          e.preventDefault();
        }
      } else if (e.key === "c") {
        if (delta?.availableActions.includes("report_correction")) {
          setCorrectionOpen(true);
          e.preventDefault();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delta, currentIndex, orderedList, delegateOpen, correctionOpen, evidenceOpen]);

  function goToOffset(offset: number) {
    if (currentIndex < 0) return;
    const next = orderedList[currentIndex + offset];
    if (next) navigate(`/today/review/${encodeURIComponent(next.id)}`);
  }

  async function handleAccept() {
    if (!delta) return;
    setApplying(true);
    try {
      const result: ApplyResult = await applyDelta(delta.id);
      if (result.status === "applied") {
        showToast("success", result.resultMessage);
        await refetchPage();
        if (result.nextDeltaId) {
          navigate(`/today/review/${encodeURIComponent(result.nextDeltaId)}`);
        } else {
          navigate("/today");
        }
      } else if (result.status === "requires_refresh") {
        showToast("error", result.resultMessage);
        // Refetch detail so user sees the updated state.
        const fresh = await getDeltaDetail(delta.id);
        setDelta(fresh);
      }
    } catch (e) {
      const err = e as { status?: number; body?: ApplyResult };
      if (err.status === 409 && err.body?.resultMessage) {
        showToast("error", err.body.resultMessage);
      } else {
        showToast("error", "Could not apply change. Please try again.");
      }
    } finally {
      setApplying(false);
    }
  }

  async function handleDelegate(body: DelegateBody) {
    if (!delta) return;
    try {
      const result = await delegateDelta(delta.id, body);
      if (result.status === "delegated") {
        showToast("success", result.resultMessage);
        const fresh = await getDeltaDetail(delta.id);
        setDelta(fresh);
        await refetchPage();
      } else if (result.status === "requires_refresh") {
        showToast("error", result.resultMessage);
      }
    } catch {
      showToast("error", "Could not delegate. Please try again.");
    } finally {
      setDelegateOpen(false);
    }
  }

  async function handleCorrection(body: CorrectionBody) {
    if (!delta) return;
    try {
      const result = await submitCorrection(delta.id, body);
      if (result.status === "correction_submitted") {
        showToast("success", result.resultMessage);
        const fresh = await getDeltaDetail(delta.id);
        setDelta(fresh);
        await refetchPage();
      } else if (result.status === "requires_refresh") {
        showToast("error", result.resultMessage);
      }
    } catch {
      showToast("error", "Could not submit correction. Please try again.");
    } finally {
      setCorrectionOpen(false);
    }
  }

  async function openEvidence() {
    if (!delta) return;
    if (!evidence) {
      try {
        const ev = await getDeltaEvidence(delta.id);
        setEvidence(ev);
      } catch {
        showToast("error", "Could not load evidence right now.");
        return;
      }
    }
    setEvidenceOpen(true);
  }

  return (
    <>
      <AppShell
        sidebar={<Sidebar activeRoute="today" />}
        main={
          <div className="tdv2-page" data-testid="today-focused-page">
            {loading ? (
              <FocusedSkeleton />
            ) : error || !delta ? (
              <ErrorState message={error ?? "Not found"} onBack={() => navigate("/today")} />
            ) : (
              <>
                {pageData ? (
                  <SummaryStrip summary={pageData.summary} compressed />
                ) : null}
                <FocusedReviewCard
                  delta={delta}
                  applying={applying}
                  position={{
                    index: currentIndex >= 0 ? currentIndex : 0,
                    total: orderedList.length,
                  }}
                  onBack={() => navigate("/today")}
                  onPrev={() => goToOffset(-1)}
                  onNext={() => goToOffset(1)}
                  onAccept={() => void handleAccept()}
                  onDelegate={() => setDelegateOpen(true)}
                  onCorrect={() => setCorrectionOpen(true)}
                  onOpenEvidence={() => void openEvidence()}
                  hasPrev={currentIndex > 0}
                  hasNext={currentIndex >= 0 && currentIndex < orderedList.length - 1}
                />
                <OtherChangesRail
                  items={orderedList}
                  currentId={delta.id}
                  onOpen={(id) => navigate(`/today/review/${encodeURIComponent(id)}`)}
                />
              </>
            )}
          </div>
        }
      />
      {delta && delegateOpen ? (
        <DelegationSheet
          delta={delta}
          onCancel={() => setDelegateOpen(false)}
          onSubmit={handleDelegate}
        />
      ) : null}
      {correctionOpen ? (
        <CorrectionSheet
          onCancel={() => setCorrectionOpen(false)}
          onSubmit={handleCorrection}
        />
      ) : null}
      {delta && evidenceOpen && evidence ? (
        <EvidenceDrawer
          data={evidence}
          deltaTitle={delta.title}
          onClose={() => setEvidenceOpen(false)}
        />
      ) : null}
      {toast ? (
        <Toast text={toast.text} kind={toast.kind} onDismiss={() => setToast(null)} />
      ) : null}
    </>
  );
}

function FocusedSkeleton() {
  return (
    <div className="tdv2-skeleton" data-testid="focused-skeleton">
      <div className="tdv2-skeleton-block tdv2-skeleton-block--summary" />
      <div className="tdv2-skeleton-block tdv2-skeleton-block--primary" />
    </div>
  );
}

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="tdv2-error" data-testid="focused-error">
      <p style={{ margin: "0 0 var(--space-3) 0" }}>{message}</p>
      <button type="button" className="tdv2-btn tdv2-btn--secondary" onClick={onBack}>
        Back to Today
      </button>
    </div>
  );
}
