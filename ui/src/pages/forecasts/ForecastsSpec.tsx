import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { SpecForecastDomain } from "@/api/spec-forecast-types";
import {
  CommandPalette,
  ForecastInspector,
  ForecastRow,
  SpecShell,
  SpecSidebar,
} from "@/components/spec";
import { useSpecForecasts } from "@/hooks/useSpecData";
import { useFyralisStore } from "@/lib/store";

type Tab = "active" | "resolving_soon" | "interventions" | "resolved" | "accuracy";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "resolving_soon", label: "Resolving soon" },
  { id: "interventions", label: "Interventions available" },
  { id: "resolved", label: "Resolved" },
  { id: "accuracy", label: "Accuracy" },
];

// Forecasts page — spec §13.
export default function ForecastsSpec() {
  const { phase } = useSpecForecasts();
  const forecasts = useFyralisStore((s) => s.forecasts);
  const setSelection = useFyralisStore((s) => s.setSelection);
  const setPaletteOpen = useFyralisStore((s) => s.setPaletteOpen);

  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get("forecast"));
  const [tab, setTab] = useState<Tab>("active");
  const [domain, setDomain] = useState<SpecForecastDomain | "all">("all");

  useEffect(() => {
    const id = params.get("forecast");
    if (id) setSelectedId(id);
  }, [params]);

  const filtered = useMemo(() => {
    let xs = forecasts.slice();
    if (tab === "active") xs = xs.filter((f) => ["active", "changing", "intervention_available"].includes(f.status));
    if (tab === "resolving_soon") {
      const cutoff = Date.now() + 14 * 24 * 60 * 60 * 1000;
      xs = xs.filter((f) => f.resolutionDate && new Date(f.resolutionDate).getTime() < cutoff);
    }
    if (tab === "interventions") xs = xs.filter((f) => f.status === "intervention_available" || f.relatedDeltaId);
    if (tab === "resolved") xs = xs.filter((f) =>
      ["resolved_true", "resolved_false", "partially_true", "inconclusive"].includes(f.status)
    );
    if (domain !== "all") xs = xs.filter((f) => f.domain === domain);
    return xs;
  }, [forecasts, tab, domain]);

  // Group by domain for non-accuracy tabs.
  const grouped = useMemo(() => {
    const groups: Record<string, typeof forecasts> = {};
    for (const f of filtered) {
      const k = f.domain;
      if (!groups[k]) groups[k] = [];
      groups[k].push(f);
    }
    return groups;
  }, [filtered]);

  const selectedForecast = selectedId ? forecasts.find((f) => f.id === selectedId) ?? null : null;

  return (
    <>
      <SpecShell
        sidebar={<SpecSidebar active="forecasts" />}
        main={
          <div className="fx-stack--xl">
            <header className="fx-pageheader">
              <div>
                <h1 className="fx-pageheader__title">Forecasts</h1>
                <p className="fx-pageheader__compression">
                  {forecasts.length} active forecasts · {forecasts.filter((f) => f.confidencePrevious != null && Math.abs(f.confidence - (f.confidencePrevious ?? 0)) > 0.05).length} changed confidence today · {forecasts.filter((f) => f.resolutionDate && new Date(f.resolutionDate).getTime() < Date.now() + 7 * 86400000).length} resolve this week
                </p>
              </div>
              <div className="fx-pageheader__right">
                <button type="button" className="fx-btn" onClick={() => setPaletteOpen(true)}>
                  Ask Fyralis <span style={{ opacity: 0.6, marginLeft: 4 }}>⌘K</span>
                </button>
              </div>
            </header>

            <div className="fx-lensbar" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`fx-lensbar__btn${tab === t.id ? " fx-lensbar__btn--active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab !== "accuracy" ? (
              <>
                <div className="fx-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {(["all", "customer", "revenue", "delivery", "capacity", "strategy", "risk"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`fx-pill${domain === d ? " fx-pill--evidence" : " fx-pill--ghost"}`}
                      onClick={() => setDomain(d as never)}
                    >
                      {d === "all" ? "All domains" : d}
                    </button>
                  ))}
                </div>

                {phase === "loading" && forecasts.length === 0 ? (
                  <div className="fx-empty">Loading forecasts…</div>
                ) : Object.keys(grouped).length === 0 ? (
                  <div className="fx-empty"><strong>No forecasts under this tab.</strong></div>
                ) : (
                  Object.entries(grouped).map(([d, items]) => (
                    <section key={d} className="fx-section">
                      <header className="fx-section__head">
                        <div className="fx-section__title">{d[0].toUpperCase() + d.slice(1)}</div>
                        <div className="fx-section__sub">{items.length} forecast{items.length === 1 ? "" : "s"}</div>
                      </header>
                      <div className="fx-stack">
                        {items.map((f) => (
                          <ForecastRow
                            key={f.id}
                            forecast={f}
                            selected={selectedId === f.id}
                            onSelect={(id) => {
                              setSelectedId(id);
                              setSelection({ forecastId: id });
                              setParams({ forecast: id });
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </>
            ) : (
              <AccuracyPanel />
            )}
          </div>
        }
        inspector={
          selectedForecast ? (
            <ForecastInspector
              forecast={selectedForecast}
              onClose={() => {
                setSelectedId(null);
                setParams({});
              }}
            />
          ) : undefined
        }
      />
      <CommandPalette />
    </>
  );
}

function AccuracyPanel() {
  const forecasts = useFyralisStore((s) => s.forecasts);
  const resolved = forecasts.filter((f) =>
    ["resolved_true", "resolved_false", "partially_true", "inconclusive"].includes(f.status)
  );
  const ts = resolved.filter((r) => r.status === "resolved_true").length;
  const fs = resolved.filter((r) => r.status === "resolved_false").length;
  const ps = resolved.filter((r) => r.status === "partially_true").length;
  return (
    <section className="fx-stack--lg">
      <div className="fx-section__title">Calibration over time</div>
      <div className="fx-row" style={{ gap: 24 }}>
        <Stat label="Resolved" value={resolved.length} />
        <Stat label="True" value={ts} />
        <Stat label="False" value={fs} />
        <Stat label="Partial" value={ps} />
      </div>
      <div className="fx-muted" style={{ fontSize: 13 }}>
        Forecast accuracy is reported soberly — Fyralis does not gamify
        prediction tracking. Calibration impact is recorded per resolution
        in the Ledger.
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="fx-stack" style={{ gap: 2 }}>
      <div style={{ fontFamily: "var(--font-serif-v2)", fontSize: 28 }}>{value}</div>
      <div className="fx-muted" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
