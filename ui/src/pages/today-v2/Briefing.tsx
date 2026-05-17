// Today page — Briefing Mode. Default landing surface.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppShell } from "@/shell/AppShell";
import { Sidebar } from "@/shell/Sidebar";

import { useTodayPage } from "@/hooks/useTodayPage";

import { BriefingHeader } from "@/components/today-v2/BriefingHeader";
import { SummaryStrip } from "@/components/today-v2/SummaryStrip";
import { PrimaryJudgmentCard } from "@/components/today-v2/PrimaryJudgmentCard";
import { OtherJudgmentList } from "@/components/today-v2/OtherJudgmentList";
import { HandledWithoutYouPanel } from "@/components/today-v2/HandledWithoutYouPanel";
import { DelegationSheet } from "@/components/today-v2/DelegationSheet";
import { CorrectionSheet } from "@/components/today-v2/CorrectionSheet";
import { Toast } from "@/components/today-v2/Toast";

import type {
  CorrectionBody,
  DecisionDelta,
  DelegateBody,
  HandledWithoutYouSummary,
} from "@/api/today-page-types";

import "@/pages/today-v2/styles.css";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; text: string; id: number };

export default function TodayBriefing() {
  const navigate = useNavigate();
  const { data, loading, error, applyChange, delegate, correct, refetch } = useTodayPage();

  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [delegateTarget, setDelegateTarget] = useState<DecisionDelta | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<DecisionDelta | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Keyboard model — spec §16.1
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (delegateTarget) {
          setDelegateTarget(null);
          e.preventDefault();
        } else if (correctionTarget) {
          setCorrectionTarget(null);
          e.preventDefault();
        }
        return;
      }
      if (e.key === "Enter" && data?.primaryJudgment && !delegateTarget && !correctionTarget) {
        navigate(`/today/review/${encodeURIComponent(data.primaryJudgment.id)}`);
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [data, navigate, delegateTarget, correctionTarget]);

  const showToast = useCallback((kind: ToastKind, text: string) => {
    setToast({ kind, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openFocused = useCallback(
    (id: string) => navigate(`/today/review/${encodeURIComponent(id)}`),
    [navigate],
  );

  const handleAccept = useCallback(
    async (id: string) => {
      setApplyingId(id);
      try {
        const result = await applyChange(id);
        if (result?.status === "applied") {
          showToast("success", result.resultMessage);
        } else if (result?.status === "requires_refresh") {
          showToast("error", result.resultMessage);
          await refetch();
        }
      } catch {
        showToast("error", "Could not apply change. Please try again.");
      } finally {
        setApplyingId(null);
      }
    },
    [applyChange, refetch, showToast],
  );

  const handleDelegate = useCallback(
    async (body: DelegateBody) => {
      if (!delegateTarget) return;
      try {
        const result = await delegate(delegateTarget.id, body);
        if (result?.status === "delegated") {
          showToast("success", result.resultMessage);
        } else if (result?.status === "requires_refresh") {
          showToast("error", result.resultMessage);
          await refetch();
        }
      } catch {
        showToast("error", "Could not delegate change. Please try again.");
      } finally {
        setDelegateTarget(null);
      }
    },
    [delegate, delegateTarget, refetch, showToast],
  );

  const handleCorrection = useCallback(
    async (body: CorrectionBody) => {
      if (!correctionTarget) return;
      try {
        const result = await correct(correctionTarget.id, body);
        if (result?.status === "correction_submitted") {
          showToast("success", result.resultMessage);
        } else if (result?.status === "requires_refresh") {
          showToast("error", result.resultMessage);
          await refetch();
        }
      } catch {
        showToast("error", "Could not submit correction. Please try again.");
      } finally {
        setCorrectionTarget(null);
      }
    },
    [correct, correctionTarget, refetch, showToast],
  );

  return (
    <>
      <AppShell
        sidebar={<Sidebar activeRoute="today" />}
        main={
          <div className="tdv2-page" data-testid="today-page">
            {loading && !data ? (
              <LoadingSkeleton />
            ) : error ? (
              <ErrorState />
            ) : data ? (
              <>
                <BriefingHeader
                  summary={data.summary}
                  generatedAt={data.generatedAt}
                />
                <SummaryStrip summary={data.summary} />
                {data.primaryJudgment || data.otherChanges.length > 0 ? (
                  <div className="tdv2-body">
                    <div>
                      {data.primaryJudgment ? (
                        <PrimaryJudgmentCard
                          delta={data.primaryJudgment}
                          applying={applyingId === data.primaryJudgment.id}
                          onOpen={() => openFocused(data.primaryJudgment!.id)}
                          onAccept={() => handleAccept(data.primaryJudgment!.id)}
                          onDelegate={() => setDelegateTarget(data.primaryJudgment!)}
                          onCorrect={() => setCorrectionTarget(data.primaryJudgment!)}
                        />
                      ) : null}
                    </div>
                    <aside className="tdv2-side">
                      <OtherJudgmentList
                        items={data.otherChanges}
                        onOpen={openFocused}
                      />
                      <HandledWithoutYouPanel summary={data.handledWithoutYou} />
                    </aside>
                  </div>
                ) : (
                  <AllClearState summary={data.handledWithoutYou} />
                )}
              </>
            ) : null}
          </div>
        }
      />
      {delegateTarget ? (
        <DelegationSheet
          delta={delegateTarget}
          onCancel={() => setDelegateTarget(null)}
          onSubmit={handleDelegate}
        />
      ) : null}
      {correctionTarget ? (
        <CorrectionSheet
          onCancel={() => setCorrectionTarget(null)}
          onSubmit={handleCorrection}
        />
      ) : null}
      {toast ? <Toast text={toast.text} kind={toast.kind} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="tdv2-skeleton" data-testid="today-skeleton">
      <div className="tdv2-skeleton-block tdv2-skeleton-block--summary" />
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "var(--space-6)" }}>
        <div className="tdv2-skeleton-block tdv2-skeleton-block--primary" />
        <div className="tdv2-skeleton-block tdv2-skeleton-block--side" />
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="tdv2-error" data-testid="today-error">
      We couldn't load Today right now. Try again in a moment.
    </div>
  );
}

function AllClearState({ summary }: { summary: HandledWithoutYouSummary }) {
  return (
    <div className="tdv2-empty" data-testid="today-all-clear">
      <h2 className="tdv2-empty__title">Nothing needs your judgment right now.</h2>
      <p className="tdv2-empty__body">
        Fyralis processed {summary.signalsAbsorbed} signals since your last review.
        {summary.modelUpdatesApplied > 0
          ? ` ${summary.modelUpdatesApplied} model updates were absorbed automatically.`
          : ""}
        {summary.itemsUnderMonitoring > 0
          ? ` ${summary.itemsUnderMonitoring} items are being monitored.`
          : ""}
      </p>
      <div className="tdv2-empty__actions">
        <a className="tdv2-btn tdv2-btn--primary" href="/model">Open Model</a>
        <a className="tdv2-btn tdv2-btn--secondary" href="/ledger">View Ledger</a>
      </div>
    </div>
  );
}
