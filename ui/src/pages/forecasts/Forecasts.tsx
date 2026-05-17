import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { Sidebar } from "@/shell/Sidebar";
import { SummaryStrip } from "@/components/primitives";
import type { SummaryStripCell } from "@/components/primitives";
import {
  createScenario,
  getAccuracy,
  getForecast,
  getRiskExposure,
  getSummary,
  getUpcoming,
  listForecasts,
} from "@/api/forecasts-client";
import type {
  AccuracyResponse,
  CreateScenarioBody,
  ForecastSort,
  ListResponse,
  PredictionDetail,
  PredictionRow,
  RiskExposureResponse,
  SummaryResponse,
  UpcomingResponse,
} from "@/api/forecasts-types";
import { ForecastsHeader } from "@/components/forecasts/ForecastsHeader";
import { ForecastsTabs } from "@/components/forecasts/ForecastsTabs";
import type { ForecastsTabId } from "@/components/forecasts/ForecastsTabs";
import { PredictionsList } from "@/components/forecasts/PredictionsList";
import { RiskExposureChart } from "@/components/forecasts/RiskExposureChart";
import { UpcomingResolutions } from "@/components/forecasts/UpcomingResolutions";
import { ForecastsInspector } from "@/components/forecasts/ForecastsInspector";
import { AccuracyPanel } from "@/components/forecasts/AccuracyPanel";
import { ResolvedList } from "@/components/forecasts/ResolvedList";
import { NewScenarioDialog } from "@/components/forecasts/NewScenarioDialog";
import { formatCurrency } from "@/components/forecasts/format";

type Phase = "loading" | "ready" | "empty" | "error";

export default function ForecastsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ForecastsTabId>("active");
  const [sort, setSort] = useState<ForecastSort>("earliest_resolution");
  const [scope, setScope] = useState("Company-wide");
  const [range, setRange] = useState("Next 90 days");
  const [riskMetric, setRiskMetric] = useState("arr_at_risk");

  const [active, setActive] = useState<ListResponse | null>(null);
  const [resolved, setResolved] = useState<ListResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [risk, setRisk] = useState<RiskExposureResponse | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingResponse | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);

  const [activePhase, setActivePhase] = useState<Phase>("loading");
  const [resolvedPhase, setResolvedPhase] = useState<Phase>("loading");
  const [accuracyPhase, setAccuracyPhase] = useState<Phase>("loading");
  const [riskPhase, setRiskPhase] = useState<Phase>("loading");
  const [upcomingPhase, setUpcomingPhase] = useState<Phase>("loading");
  const [activeError, setActiveError] = useState<string | null>(null);
  const [resolvedError, setResolvedError] = useState<string | null>(null);
  const [accuracyError, setAccuracyError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PredictionDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Track in-flight fetches so we can ignore stale responses on tab switches.
  const activeReqRef = useRef(0);
  const resolvedReqRef = useRef(0);
  const accuracyReqRef = useRef(0);
  const detailReqRef = useRef(0);

  const fetchActive = useCallback(
    async (signal?: AbortSignal) => {
      const reqId = ++activeReqRef.current;
      setActivePhase("loading");
      setActiveError(null);
      try {
        const data = await listForecasts({ status: "active", sort }, signal);
        if (reqId !== activeReqRef.current) return;
        setActive(data);
        setActivePhase(data.items.length === 0 ? "empty" : "ready");
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (reqId !== activeReqRef.current) return;
        setActiveError((e as Error).message);
        setActivePhase("error");
      }
    },
    [sort]
  );

  const fetchResolved = useCallback(async (signal?: AbortSignal) => {
    const reqId = ++resolvedReqRef.current;
    setResolvedPhase("loading");
    setResolvedError(null);
    try {
      const data = await listForecasts({ status: "resolved" }, signal);
      if (reqId !== resolvedReqRef.current) return;
      setResolved(data);
      setResolvedPhase(data.items.length === 0 ? "empty" : "ready");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (reqId !== resolvedReqRef.current) return;
      setResolvedError((e as Error).message);
      setResolvedPhase("error");
    }
  }, []);

  const fetchAccuracy = useCallback(async (signal?: AbortSignal) => {
    const reqId = ++accuracyReqRef.current;
    setAccuracyPhase("loading");
    setAccuracyError(null);
    try {
      const data = await getAccuracy(180, signal);
      if (reqId !== accuracyReqRef.current) return;
      setAccuracy(data);
      setAccuracyPhase("ready");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (reqId !== accuracyReqRef.current) return;
      setAccuracyError((e as Error).message);
      setAccuracyPhase("error");
    }
  }, []);

  const fetchSummary = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getSummary(signal);
      setSummary(data);
    } catch {
      // summary failure is non-fatal — strip is decorative.
    }
  }, []);

  const fetchRisk = useCallback(
    async (signal?: AbortSignal) => {
      setRiskPhase("loading");
      setRiskError(null);
      try {
        const data = await getRiskExposure(riskMetric, 90, signal);
        setRisk(data);
        setRiskPhase("ready");
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setRiskError((e as Error).message);
        setRiskPhase("error");
      }
    },
    [riskMetric]
  );

  const fetchUpcoming = useCallback(async (signal?: AbortSignal) => {
    setUpcomingPhase("loading");
    setUpcomingError(null);
    try {
      const data = await getUpcoming(14, signal);
      setUpcoming(data);
      setUpcomingPhase(data.items.length === 0 ? "empty" : "ready");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setUpcomingError((e as Error).message);
      setUpcomingPhase("error");
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void fetchSummary(ac.signal);
    void fetchActive(ac.signal);
    void fetchRisk(ac.signal);
    void fetchUpcoming(ac.signal);
    return () => ac.abort();
  }, [fetchSummary, fetchActive, fetchRisk, fetchUpcoming]);

  useEffect(() => {
    if (tab !== "resolved") return;
    const ac = new AbortController();
    void fetchResolved(ac.signal);
    return () => ac.abort();
  }, [tab, fetchResolved]);

  useEffect(() => {
    if (tab !== "accuracy") return;
    const ac = new AbortController();
    void fetchAccuracy(ac.signal);
    return () => ac.abort();
  }, [tab, fetchAccuracy]);

  // Auto-select the first active row once it loads.
  useEffect(() => {
    if (selectedId || !active || active.items.length === 0) return;
    setSelectedId(active.items[0].id);
  }, [active, selectedId]);

  // Fetch the detail for the selected row.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const reqId = ++detailReqRef.current;
    const ac = new AbortController();
    (async () => {
      try {
        const d = await getForecast(selectedId, ac.signal);
        if (reqId !== detailReqRef.current) return;
        setDetail(d);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (reqId !== detailReqRef.current) return;
        setDetail(null);
      }
    })();
    return () => ac.abort();
  }, [selectedId]);

  const summaryCells = useMemo<SummaryStripCell[]>(() => {
    return [
      {
        label: "Active predictions",
        value: summary?.active_count ?? "—",
        sub: <span>↗ 2 new this week</span>,
      },
      {
        label: "At-risk ARR",
        value: summary ? formatCurrency(summary.at_risk_arr) : "—",
        sub: <span>↗ $1.12M vs last week</span>,
      },
      {
        label: "High confidence",
        value: summary?.high_confidence_count ?? "—",
        sub: <span>≥ 70% confidence</span>,
      },
      {
        label: "Upcoming resolutions",
        value: summary?.upcoming_resolutions_count_14d ?? "—",
        sub: <span>Next in 2 days</span>,
      },
      {
        label: "Model calibration",
        value:
          summary?.model_calibration !== null &&
          summary?.model_calibration !== undefined
            ? summary.model_calibration.toFixed(2)
            : "—",
        sub: (
          <span className="fc-summary__sub-with-spark">
            <span>
              {summary?.calibration_delta !== null &&
              summary?.calibration_delta !== undefined
                ? `${summary.calibration_delta >= 0 ? "↗" : "↘"} ${summary.calibration_delta >= 0 ? "+" : ""}${summary.calibration_delta.toFixed(2)} vs last week`
                : "—"}
            </span>
            <Sparkline />
          </span>
        ),
      },
    ];
  }, [summary]);

  const handleNewScenario = useCallback(() => setDialogOpen(true), []);

  const handleSubmitScenario = useCallback(
    async (body: CreateScenarioBody) => {
      await createScenario(body);
      setDialogOpen(false);
      const ac = new AbortController();
      await Promise.all([
        fetchActive(ac.signal),
        fetchSummary(ac.signal),
        fetchUpcoming(ac.signal),
        fetchRisk(ac.signal),
      ]);
    },
    [fetchActive, fetchSummary, fetchUpcoming, fetchRisk]
  );

  const handleOpenInModel = useCallback(() => {
    navigate("/model");
  }, [navigate]);

  // Right inspector content (only on Active or Resolved tabs).
  const inspectorNode =
    detail && (tab === "active" || tab === "resolved") ? (
      <ForecastsInspector
        detail={detail}
        onClose={() => setSelectedId(null)}
        onOpenInModel={handleOpenInModel}
      />
    ) : undefined;

  const activeItems = active?.items ?? [];
  const resolvedItems = resolved?.items ?? [];

  const mainContent = (
    <div className="fc-page">
      <ForecastsHeader
        scope={scope}
        range={range}
        onScopeChange={setScope}
        onRangeChange={setRange}
        onNewScenario={handleNewScenario}
      />

      <ForecastsTabs
        active={tab}
        onChange={(t) => setTab(t)}
        counts={{
          active: summary?.active_count,
          resolved: resolved?.count,
        }}
      />

      <SummaryStrip cells={summaryCells} />

      {tab === "active" ? (
        <div className="fc-body">
          <div className="fc-body__left">
            <PredictionsList
              predictions={activeItems}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              sort={sort}
              onSortChange={setSort}
              onNewScenario={handleNewScenario}
              loading={activePhase === "loading"}
              error={activePhase === "error" ? activeError : null}
            />
          </div>
          <div className="fc-body__right">
            <RiskExposureChart
              data={risk}
              metric={riskMetric}
              onMetricChange={setRiskMetric}
              total={summary?.at_risk_arr ?? 0}
              deltaAbs={1120000}
              deltaPct={0.41}
              loading={riskPhase === "loading"}
              error={riskPhase === "error" ? riskError : null}
            />
            <UpcomingResolutions
              items={upcoming?.items ?? []}
              onSelect={(id) => {
                setSelectedId(id);
                setTab("active");
              }}
              loading={upcomingPhase === "loading"}
              error={upcomingPhase === "error" ? upcomingError : null}
            />
          </div>
        </div>
      ) : tab === "resolved" ? (
        <ResolvedList
          predictions={resolvedItems}
          loading={resolvedPhase === "loading"}
          error={resolvedPhase === "error" ? resolvedError : null}
          onSelect={(id) => setSelectedId(id)}
          selectedId={selectedId}
        />
      ) : (
        <AccuracyPanel
          data={accuracy}
          loading={accuracyPhase === "loading"}
          error={accuracyPhase === "error" ? accuracyError : null}
        />
      )}

      <NewScenarioDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmitScenario}
      />
    </div>
  );

  return (
    <AppShell
      sidebar={<Sidebar activeRoute="forecasts" />}
      main={mainContent}
      inspector={inspectorNode}
    />
  );
}

function Sparkline() {
  return (
    <svg
      width="44"
      height="14"
      viewBox="0 0 44 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="fc-summary__spark"
    >
      <polyline
        fill="none"
        stroke="var(--color-veiled-iris)"
        strokeWidth="1.2"
        points="0,10 6,8 12,9 18,6 24,7 30,5 36,6 44,3"
      />
    </svg>
  );
}
