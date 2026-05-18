// Today page — two modes: Briefing + Review.
//
//   Briefing Mode (default, `/today`):
//     Today header → Fyralis Brief → Primary Judgment Preview →
//     Other Items → Handled Without You.
//
//   Review Mode (`/today?review=<id>`):
//     Global sidebar collapses to an icon rail (with hover-expand).
//     A local Review Queue Rail appears alongside a Focused Review
//     Sheet for the selected proposed change. Switching items stays in
//     Review Mode; Collapse / Esc returns to Briefing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppShell } from "@/shell/AppShell";
import { Sidebar } from "@/shell/Sidebar";

import { useTodayPage } from "@/hooks/useTodayPage";
import { getDeltaEvidence } from "@/api/today-page-client";

import { BriefingHeader } from "@/components/today-v2/BriefingHeader";
import {
  FyralisBrief,
  deriveWhatChanged,
} from "@/components/today-v2/FyralisBrief";
import { PrimaryJudgmentPreview } from "@/components/today-v2/PrimaryJudgmentPreview";
import { OtherItemsList } from "@/components/today-v2/OtherItemsList";
import { HandledWithoutYou } from "@/components/today-v2/HandledWithoutYou";
import { ReviewQueueRail } from "@/components/today-v2/ReviewQueueRail";
import { FocusedReviewCard } from "@/components/today-v2/FocusedReviewCard";
import { DelegationSheet } from "@/components/today-v2/DelegationSheet";
import { CorrectionSheet } from "@/components/today-v2/CorrectionSheet";
import { EvidenceDrawer } from "@/components/today-v2/EvidenceDrawer";
import { Toast } from "@/components/today-v2/Toast";

import type {
  CorrectionBody,
  DecisionDelta,
  DelegateBody,
  EvidenceResponse,
  HandledWithoutYouSummary,
} from "@/api/today-page-types";

import "@/pages/today-v2/styles.css";

type ToastKind = "success" | "error" | "info";
type ToastState = { kind: ToastKind; text: string; id: number };

export default function TodayBriefing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, applyChange, delegate, correct, refetch } =
    useTodayPage();

  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [delegateTarget, setDelegateTarget] = useState<DecisionDelta | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<DecisionDelta | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Lazy-loaded evidence keyed by deltaId. Cleared on refetch.
  const [evidenceCache, setEvidenceCache] = useState<
    Record<string, EvidenceResponse>
  >({});
  const [evidenceDelta, setEvidenceDelta] = useState<DecisionDelta | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  // Ordered queue: primary first, then others.
  const orderedQueue = useMemo<DecisionDelta[]>(() => {
    if (!data) return [];
    const list: DecisionDelta[] = [];
    if (data.primaryJudgment) list.push(data.primaryJudgment);
    list.push(...data.otherChanges);
    return list;
  }, [data]);

  // Review state lives in the URL query (`?review=<id>`). When that
  // param matches a known delta, we are in Review Mode; otherwise
  // Briefing Mode. Reading from URL keeps deep-link + back-button
  // behavior honest.
  const reviewIdRaw = searchParams.get("review");
  const reviewId = useMemo(() => {
    if (!reviewIdRaw) return null;
    return orderedQueue.some((d) => d.id === reviewIdRaw) ? reviewIdRaw : null;
  }, [reviewIdRaw, orderedQueue]);
  const reviewMode = reviewId !== null;
  const selectedDelta = useMemo(
    () => orderedQueue.find((d) => d.id === reviewId) ?? null,
    [orderedQueue, reviewId],
  );

  const setReviewId = useCallback(
    (id: string | null, opts?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("review", id);
      else next.delete("review");
      setSearchParams(next, { replace: opts?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  const enterReview = useCallback(
    (id: string) => {
      setReviewId(id);
      window.setTimeout(() => {
        const heading = document.querySelector<HTMLElement>(
          `#focused-${id} .tdv2-review__title`,
        );
        heading?.focus?.();
      }, 0);
    },
    [setReviewId],
  );

  const exitReview = useCallback(() => setReviewId(null), [setReviewId]);

  // Deep-link support stays automatic: ?review=<id> opens Review Mode
  // on load. No legacy `?expand=` migration is needed for product
  // users since this page never shipped behind that flag publicly.
  // ---------------------------------------------------------------

  const positionOf = useCallback(
    (id: string): { index: number; total: number } | null => {
      const idx = orderedQueue.findIndex((d) => d.id === id);
      if (idx < 0) return null;
      return { index: idx, total: orderedQueue.length };
    },
    [orderedQueue],
  );

  // Keyboard model. Spec §14: Esc collapse, J/K next/prev, A/D/E/R
  // bound to action bar. Shortcuts only fire in Review Mode (and not
  // while focus is inside an input/textarea or a sheet).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        if (evidenceDelta) {
          setEvidenceDelta(null);
          e.preventDefault();
        } else if (delegateTarget) {
          setDelegateTarget(null);
          e.preventDefault();
        } else if (correctionTarget) {
          setCorrectionTarget(null);
          e.preventDefault();
        } else if (reviewMode) {
          exitReview();
          e.preventDefault();
        }
        return;
      }

      if (!reviewMode || !selectedDelta) return;
      if (delegateTarget || correctionTarget || evidenceDelta) return;

      const idx = orderedQueue.findIndex((d) => d.id === selectedDelta.id);
      if (e.key === "j" || e.key === "ArrowDown") {
        if (idx + 1 < orderedQueue.length) {
          setReviewId(orderedQueue[idx + 1].id, { replace: true });
          e.preventDefault();
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (idx - 1 >= 0) {
          setReviewId(orderedQueue[idx - 1].id, { replace: true });
          e.preventDefault();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    correctionTarget,
    delegateTarget,
    evidenceDelta,
    exitReview,
    orderedQueue,
    reviewMode,
    selectedDelta,
    setReviewId,
  ]);

  const showToast = useCallback((kind: ToastKind, text: string) => {
    setToast({ kind, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Abort an in-flight evidence fetch when the user opens a different
  // delta, closes the drawer, or unmounts the page.
  const evidenceAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (evidenceDelta === null) {
      evidenceAbortRef.current?.abort();
      evidenceAbortRef.current = null;
    }
  }, [evidenceDelta]);
  useEffect(
    () => () => {
      evidenceAbortRef.current?.abort();
    },
    [],
  );

  const openEvidence = useCallback(
    async (delta: DecisionDelta) => {
      setEvidenceDelta(delta);
      if (evidenceCache[delta.id]) return;

      evidenceAbortRef.current?.abort();
      const controller = new AbortController();
      evidenceAbortRef.current = controller;

      setEvidenceLoading(true);
      try {
        const ev = await getDeltaEvidence(delta.id, controller.signal);
        if (controller.signal.aborted) return;
        setEvidenceCache((prev) => ({ ...prev, [delta.id]: ev }));
      } catch (err) {
        if (controller.signal.aborted) return;
        if ((err as { name?: string })?.name === "AbortError") return;
        showToast("error", "Could not load evidence right now.");
        setEvidenceDelta(null);
      } finally {
        if (!controller.signal.aborted) {
          setEvidenceLoading(false);
        }
      }
    },
    [evidenceCache, showToast],
  );

  const handleAccept = useCallback(
    async (id: string) => {
      setApplyingId(id);
      try {
        const result = await applyChange(id);
        if (result?.status === "applied") {
          showToast("success", result.resultMessage);
          // If we accepted the currently-reviewed delta, advance to the
          // next item in the queue if there is one, else exit Review.
          if (reviewId === id) {
            const idx = orderedQueue.findIndex((d) => d.id === id);
            const next = orderedQueue.find((d, i) => i !== idx && d.id !== id);
            if (next && idx >= 0 && idx + 1 < orderedQueue.length) {
              setReviewId(orderedQueue[idx + 1]?.id ?? next.id, { replace: true });
            } else {
              exitReview();
            }
          }
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
    [applyChange, exitReview, orderedQueue, refetch, reviewId, setReviewId, showToast],
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

  const whatChanged = useMemo(
    () => (data ? deriveWhatChanged(orderedQueue) : []),
    [data, orderedQueue],
  );

  return (
    <>
      <AppShell
        sidebarMode={reviewMode ? "collapsed" : "expanded"}
        sidebar={
          <Sidebar
            activeRoute="today"
            mode={reviewMode ? "collapsed" : "expanded"}
          />
        }
        main={
          <div
            className={`tdv2-page tdv2-page--${reviewMode ? "review" : "briefing"}`}
            data-testid="today-page"
            data-mode={reviewMode ? "review" : "briefing"}
          >
            {loading && !data ? (
              <LoadingSkeleton />
            ) : error ? (
              <ErrorState />
            ) : data ? (
              reviewMode && selectedDelta ? (
                <ReviewModeBody
                  selected={selectedDelta}
                  queue={orderedQueue}
                  handled={data.handledWithoutYou}
                  applyingId={applyingId}
                  positionOf={positionOf}
                  onSelect={(id) => setReviewId(id)}
                  onCollapse={exitReview}
                  onAccept={handleAccept}
                  onDelegate={(d) => setDelegateTarget(d)}
                  onCorrect={(d) => setCorrectionTarget(d)}
                  onOpenEvidence={(d) => void openEvidence(d)}
                />
              ) : (
                <BriefingModeBody
                  generatedAt={data.generatedAt}
                  summary={data.summary}
                  primary={data.primaryJudgment}
                  others={data.otherChanges}
                  handled={data.handledWithoutYou}
                  whatChanged={whatChanged}
                  onReview={enterReview}
                />
              )
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
      {evidenceDelta && evidenceCache[evidenceDelta.id] ? (
        <EvidenceDrawer
          data={evidenceCache[evidenceDelta.id]}
          deltaTitle={evidenceDelta.title}
          onClose={() => setEvidenceDelta(null)}
        />
      ) : null}
      {evidenceDelta && evidenceLoading && !evidenceCache[evidenceDelta.id] ? (
        <EvidenceLoadingBackdrop />
      ) : null}
      {toast ? (
        <Toast
          text={toast.text}
          kind={toast.kind}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------
// Briefing Mode body — spec §4
// ---------------------------------------------------------------------

interface BriefingProps {
  generatedAt: string;
  summary: import("@/api/today-page-types").TodaySummary;
  primary: DecisionDelta | null;
  others: DecisionDelta[];
  handled: HandledWithoutYouSummary;
  whatChanged: import("@/components/today-v2/FyralisBrief").WhatChangedItem[];
  onReview: (id: string) => void;
}

function BriefingModeBody({
  generatedAt,
  summary,
  primary,
  others,
  handled,
  whatChanged,
  onReview,
}: BriefingProps) {
  const total = (primary ? 1 : 0) + others.length;
  return (
    <>
      <BriefingHeader summary={summary} generatedAt={generatedAt} />
      <FyralisBrief
        synthesis={handled.reassuranceCopy}
        whatChanged={whatChanged}
        handled={handled}
      />
      {primary ? (
        <PrimaryJudgmentPreview
          delta={primary}
          total={total}
          onReview={() => onReview(primary.id)}
        />
      ) : null}
      <OtherItemsList items={others} onReview={onReview} />
      <HandledWithoutYou summary={handled} />
      {!primary && others.length === 0 ? <AllClearState summary={handled} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------
// Review Mode body — spec §5–§11
// ---------------------------------------------------------------------

interface ReviewProps {
  selected: DecisionDelta;
  queue: DecisionDelta[];
  handled: HandledWithoutYouSummary;
  applyingId: string | null;
  positionOf: (id: string) => { index: number; total: number } | null;
  onSelect: (id: string) => void;
  onCollapse: () => void;
  onAccept: (id: string) => void;
  onDelegate: (d: DecisionDelta) => void;
  onCorrect: (d: DecisionDelta) => void;
  onOpenEvidence: (d: DecisionDelta) => void;
}

function ReviewModeBody({
  selected,
  queue,
  handled,
  applyingId,
  positionOf,
  onSelect,
  onCollapse,
  onAccept,
  onDelegate,
  onCorrect,
  onOpenEvidence,
}: ReviewProps) {
  return (
    <div className="tdv2-review-mode" data-testid="review-mode">
      <ReviewQueueRail
        items={queue}
        selectedId={selected.id}
        handled={handled}
        onSelect={onSelect}
      />
      <div className="tdv2-review-mode__sheet-wrap">
        <FocusedReviewCard
          delta={selected}
          applying={applyingId === selected.id}
          position={positionOf(selected.id)}
          onCollapse={onCollapse}
          onAccept={() => onAccept(selected.id)}
          onDelegate={() => onDelegate(selected)}
          onCorrect={() => onCorrect(selected)}
          onOpenEvidence={() => onOpenEvidence(selected)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Misc states
// ---------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="tdv2-skeleton" data-testid="today-skeleton">
      <div className="tdv2-skeleton-block tdv2-skeleton-block--summary" />
      <div className="tdv2-skeleton-block tdv2-skeleton-block--primary" />
      <div className="tdv2-skeleton-block tdv2-skeleton-block--side" />
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

function EvidenceLoadingBackdrop() {
  return (
    <div className="tdv2-drawer-backdrop" data-testid="evidence-loading">
      <div className="tdv2-drawer" style={{ padding: "var(--space-6)" }}>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
          Loading evidence…
        </p>
      </div>
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
        <a className="tdv2-btn tdv2-btn--primary" href="/model">
          Open Model
        </a>
        <a className="tdv2-btn tdv2-btn--secondary" href="/ledger">
          View Ledger
        </a>
      </div>
    </div>
  );
}
