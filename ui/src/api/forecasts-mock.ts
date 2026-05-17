// Mock fixtures for the Forecasts page. Shape matches forecasts-types.ts
// and is consumed by tests (vitest fetch stub + Playwright page.route).
// Predictions list mirrors the spec / screenshot examples.

import type {
  AccuracyResponse,
  ListResponse,
  PredictionDetail,
  PredictionRow,
  RiskExposureResponse,
  SummaryResponse,
  UpcomingResponse,
} from "./forecasts-types";

const TENANT = "11111111-1111-1111-1111-111111111111";
const NOW_ISO = "2026-05-15T14:18:00Z";

function daysFromNow(d: number, hour = 17, minute = 0): string {
  const base = new Date("2026-05-15T00:00:00Z").getTime();
  const t = new Date(base + d * 86_400_000);
  t.setUTCHours(hour, minute, 0, 0);
  return t.toISOString();
}

export const PREDICTION_BEACON: PredictionRow = {
  id: "pred-beacon-renewal",
  tenant_id: TENANT,
  status: "active",
  statement: "Beacon renewal at risk",
  rationale:
    "Two sync incidents this month plus a stalled exec brief; renewal call sits in 11 days.",
  category: "customer_risk",
  target_node_kind: "customer",
  target_node_id: "cust-beacon",
  target_label: "Beacon",
  confidence: 0.78,
  confidence_basis: "12 signals from 4 connected sources",
  falsification_condition:
    "VP Customer Success confirms the exec brief landed by Friday, or Beacon attends the renewal kickoff.",
  key_drivers: [
    { title: "Salesforce sync failures", delta: "↑ 42%", tone: "negative" },
    { title: "Exec brief stalled", delta: "↑ 3 this week", tone: "negative" },
    { title: "Renewal call sentiment", delta: "↓ Negative", tone: "negative" },
  ],
  impact: {
    arr_at_risk: 980000,
    customers_affected: 1,
  },
  resolution_at: daysFromNow(2, 17, 0),
  resolved_at: null,
  outcome: null,
  resolution_timeliness: null,
  created_at: "2026-05-15T09:18:00Z",
  updated_at: "2026-05-15T14:17:00Z",
};

export const PREDICTION_ENG: PredictionRow = {
  id: "pred-eng-capacity",
  tenant_id: TENANT,
  status: "active",
  statement: "Engineering capacity will exceed 90%",
  rationale:
    "Sustained utilization will likely hit saturation as audit-log work absorbs slack.",
  category: "capacity",
  target_node_kind: "team",
  target_node_id: "team-eng",
  target_label: "Engineering",
  confidence: 0.71,
  confidence_basis: "Capacity trend + planning commitments",
  falsification_condition:
    "Two engineer-weeks freed by deprioritizing the analytics rebuild.",
  key_drivers: [
    { title: "Sustained utilization", delta: "↑ 14% MoM", tone: "negative" },
    { title: "New audit-log commit", delta: "+2 eng-wks", tone: "negative" },
  ],
  impact: { arr_at_risk: 0, capacity_pct: 92 },
  resolution_at: daysFromNow(6, 17, 0),
  resolved_at: null,
  outcome: null,
  resolution_timeliness: null,
  created_at: "2026-05-12T10:00:00Z",
  updated_at: "2026-05-14T11:00:00Z",
};

export const PREDICTION_Q3: PredictionRow = {
  id: "pred-q3-delivery",
  tenant_id: TENANT,
  status: "active",
  statement: "Q3 delivery commitments at risk",
  rationale: "Two enterprise commits depend on the same critical-path team.",
  category: "delivery",
  target_node_kind: "commitment",
  target_node_id: "commit-q3",
  target_label: "Q3 release train",
  confidence: 0.66,
  confidence_basis: "9 signals, mixed leading + lagging",
  falsification_condition:
    "Critical-path team adds one engineer, or one of the commits slips to Q4.",
  key_drivers: [
    { title: "Critical-path overload", delta: "↑ 22%", tone: "negative" },
    { title: "Linked enterprise asks", delta: "+1 this week", tone: "neutral" },
  ],
  impact: { arr_at_risk: 1240000, customers_affected: 2 },
  resolution_at: daysFromNow(11, 17, 0),
  resolved_at: null,
  outcome: null,
  resolution_timeliness: null,
  created_at: "2026-05-10T15:00:00Z",
  updated_at: "2026-05-14T08:00:00Z",
};

export const PREDICTION_ICP: PredictionRow = {
  id: "pred-icp-decline",
  tenant_id: TENANT,
  status: "active",
  statement: "ICP score will decline below 65",
  rationale: "Three deals closed outside ICP in the last 21 days.",
  category: "strategy",
  target_node_kind: "metric",
  target_node_id: "metric-icp",
  target_label: "ICP fit score",
  confidence: 0.62,
  confidence_basis: "Trailing 90-day mix shift",
  falsification_condition:
    "Two of the next three closes fall inside the documented ICP.",
  key_drivers: [
    { title: "Non-ICP closes", delta: "↑ 3 / 5 closed", tone: "negative" },
  ],
  impact: { arr_at_risk: 420000 },
  resolution_at: daysFromNow(18, 17, 0),
  resolved_at: null,
  outcome: null,
  resolution_timeliness: null,
  created_at: "2026-05-08T11:00:00Z",
  updated_at: "2026-05-13T09:00:00Z",
};

export const PREDICTION_PRICING: PredictionRow = {
  id: "pred-pricing-block",
  tenant_id: TENANT,
  status: "active",
  statement: "Pricing decision will continue to block roadmap",
  rationale: "No new pricing signal in 22 days; two roadmap items wait.",
  category: "decision",
  target_node_kind: "decision",
  target_node_id: "dec-pricing",
  target_label: "Pricing v2",
  confidence: 0.58,
  confidence_basis: "Stale decision pattern from history",
  falsification_condition:
    "Pricing committee ratifies a directional choice by end of month.",
  key_drivers: [
    { title: "Days since last update", delta: "↑ 22 days", tone: "negative" },
    { title: "Roadmap items blocked", delta: "2 items", tone: "neutral" },
  ],
  impact: { arr_at_risk: 320000 },
  resolution_at: daysFromNow(22, 17, 0),
  resolved_at: null,
  outcome: null,
  resolution_timeliness: null,
  created_at: "2026-05-04T10:00:00Z",
  updated_at: "2026-05-11T10:00:00Z",
};

export const PREDICTION_PARTNER: PredictionRow = {
  id: "pred-partner-health",
  tenant_id: TENANT,
  status: "active",
  statement: "Design partner health will remain weak",
  rationale:
    "Two partners off cadence; no champion check-in in 14 days for the third.",
  category: "partner",
  target_node_kind: "partner",
  target_node_id: "partner-design",
  target_label: "Design partners",
  confidence: 0.55,
  confidence_basis: "Cadence + sentiment composite",
  falsification_condition:
    "Two partners return to weekly cadence within 10 days.",
  key_drivers: [
    { title: "Off cadence", delta: "↑ 2 of 3", tone: "negative" },
  ],
  impact: { arr_at_risk: 880000 },
  resolution_at: daysFromNow(27, 17, 0),
  resolved_at: null,
  outcome: null,
  resolution_timeliness: null,
  created_at: "2026-05-02T14:00:00Z",
  updated_at: "2026-05-10T14:00:00Z",
};

export const ACTIVE_PREDICTIONS: PredictionRow[] = [
  PREDICTION_BEACON,
  PREDICTION_ENG,
  PREDICTION_Q3,
  PREDICTION_ICP,
  PREDICTION_PRICING,
  PREDICTION_PARTNER,
];

const RESOLVED_BASE: PredictionRow[] = [
  {
    id: "pred-resolved-meridian",
    tenant_id: TENANT,
    status: "resolved",
    statement: "Meridian will renew before May 1",
    rationale: "Champion is bought in; sync issues resolved last quarter.",
    category: "customer_risk",
    target_node_kind: "customer",
    target_node_id: "cust-meridian",
    target_label: "Meridian",
    confidence: 0.84,
    confidence_basis: "10 signals across CRM + product usage",
    falsification_condition: "Champion leaves before renewal kickoff.",
    key_drivers: [{ title: "Champion engaged", delta: "↑", tone: "positive" }],
    impact: { arr_at_risk: 0 },
    resolution_at: "2026-05-01T17:00:00Z",
    resolved_at: "2026-04-30T15:12:00Z",
    outcome: "true",
    resolution_timeliness: "early",
    created_at: "2026-04-15T11:00:00Z",
    updated_at: "2026-04-30T15:12:00Z",
  },
  {
    id: "pred-resolved-eng-q1",
    tenant_id: TENANT,
    status: "resolved",
    statement: "Engineering will deliver Q1 commitments on time",
    rationale: "Capacity well below cap; commit count stable.",
    category: "delivery",
    target_node_kind: "team",
    target_node_id: "team-eng",
    target_label: "Engineering",
    confidence: 0.72,
    confidence_basis: "Capacity + commit count trend",
    falsification_condition: "Two engineers depart in Q1.",
    key_drivers: [{ title: "Stable capacity", tone: "positive" }],
    impact: { arr_at_risk: 0 },
    resolution_at: "2026-03-31T17:00:00Z",
    resolved_at: "2026-04-01T10:00:00Z",
    outcome: "partial",
    resolution_timeliness: "on_time",
    created_at: "2026-02-15T09:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "pred-resolved-bay",
    tenant_id: TENANT,
    status: "resolved",
    statement: "Bay Group will renew at flat ARR",
    rationale: "Negotiation tone neutral; no expansion signals.",
    category: "customer_risk",
    target_node_kind: "customer",
    target_node_id: "cust-bay",
    target_label: "Bay Group",
    confidence: 0.68,
    confidence_basis: "8 signals, mixed tone",
    falsification_condition: "Bay Group escalates a churn signal in writing.",
    key_drivers: [{ title: "Neutral tone", tone: "neutral" }],
    impact: { arr_at_risk: 240000 },
    resolution_at: "2026-04-20T17:00:00Z",
    resolved_at: "2026-04-22T16:00:00Z",
    outcome: "false",
    resolution_timeliness: "late",
    created_at: "2026-03-10T13:00:00Z",
    updated_at: "2026-04-22T16:00:00Z",
  },
];

export const RESOLVED_PREDICTIONS: PredictionRow[] = RESOLVED_BASE;

export const FORECASTS_LIST_FIXTURE: ListResponse = {
  items: ACTIVE_PREDICTIONS,
  count: ACTIVE_PREDICTIONS.length,
};

export const FORECASTS_RESOLVED_FIXTURE: ListResponse = {
  items: RESOLVED_PREDICTIONS,
  count: RESOLVED_PREDICTIONS.length,
};

export const FORECASTS_SUMMARY_FIXTURE: SummaryResponse = {
  active_count: 8,
  at_risk_arr: 3840000,
  high_confidence_count: 3,
  upcoming_resolutions_count_14d: 5,
  model_calibration: 0.72,
  calibration_delta: 0.03,
};

export const FORECASTS_RISK_EXPOSURE_FIXTURE: RiskExposureResponse = {
  metric: "arr_at_risk",
  range_days: 90,
  buckets: [
    { bucket_start: daysFromNow(0), bucket_end: daysFromNow(7), value: 980000 },
    { bucket_start: daysFromNow(7), bucket_end: daysFromNow(14), value: 1240000 },
    { bucket_start: daysFromNow(14), bucket_end: daysFromNow(21), value: 740000 },
    { bucket_start: daysFromNow(21), bucket_end: daysFromNow(28), value: 880000 },
    { bucket_start: daysFromNow(28), bucket_end: daysFromNow(35), value: 540000 },
    { bucket_start: daysFromNow(35), bucket_end: daysFromNow(42), value: 320000 },
    { bucket_start: daysFromNow(42), bucket_end: daysFromNow(49), value: 410000 },
    { bucket_start: daysFromNow(49), bucket_end: daysFromNow(56), value: 220000 },
    { bucket_start: daysFromNow(56), bucket_end: daysFromNow(63), value: 180000 },
    { bucket_start: daysFromNow(63), bucket_end: daysFromNow(70), value: 95000 },
    { bucket_start: daysFromNow(70), bucket_end: daysFromNow(77), value: 60000 },
    { bucket_start: daysFromNow(77), bucket_end: daysFromNow(84), value: 30000 },
  ],
};

export const FORECASTS_UPCOMING_FIXTURE: UpcomingResponse = {
  items: [PREDICTION_BEACON, PREDICTION_ENG, PREDICTION_Q3],
  count: 3,
  days: 14,
};

export const FORECASTS_ACCURACY_FIXTURE: AccuracyResponse = {
  bins: [
    { bin_label: "50-60", predicted_rate: 0.55, observed_hit_rate: 0.5, n_resolved: 4 },
    { bin_label: "60-70", predicted_rate: 0.65, observed_hit_rate: 0.6, n_resolved: 5 },
    { bin_label: "70-80", predicted_rate: 0.75, observed_hit_rate: 0.72, n_resolved: 11 },
    { bin_label: "80-90", predicted_rate: 0.85, observed_hit_rate: 0.83, n_resolved: 6 },
    { bin_label: "90-100", predicted_rate: 0.95, observed_hit_rate: null, n_resolved: 2 },
  ],
  recent_resolutions: [
    {
      id: "pred-resolved-meridian",
      statement: "Meridian will renew before May 1",
      category: "customer_risk",
      confidence: 0.84,
      outcome: "true",
      resolution_timeliness: "early",
      resolved_at: "2026-04-30T15:12:00Z",
      resolution_at: "2026-05-01T17:00:00Z",
    },
    {
      id: "pred-resolved-bay",
      statement: "Bay Group will renew at flat ARR",
      category: "customer_risk",
      confidence: 0.68,
      outcome: "false",
      resolution_timeliness: "late",
      resolved_at: "2026-04-22T16:00:00Z",
      resolution_at: "2026-04-20T17:00:00Z",
    },
    {
      id: "pred-resolved-eng-q1",
      statement: "Engineering will deliver Q1 commitments on time",
      category: "delivery",
      confidence: 0.72,
      outcome: "partial",
      resolution_timeliness: "on_time",
      resolved_at: "2026-04-01T10:00:00Z",
      resolution_at: "2026-03-31T17:00:00Z",
    },
  ],
  calibration_summary: {
    value: 0.72,
    delta_vs_last_week: 0.03,
    n_resolved_total: 28,
  },
};

export const FORECAST_DETAIL_FIXTURE: PredictionDetail = {
  prediction: PREDICTION_BEACON,
  signals: [
    {
      id: "sig-1",
      source: "salesforce",
      title: "Beacon reported recurring Salesforce sync failures",
      ts: "2026-05-12T11:00:00Z",
      trust_tier: "authoritative",
      weight: 0.32,
      ordinal: 0,
    },
    {
      id: "sig-2",
      source: "email",
      title: "Exec brief delayed by Beacon legal review",
      ts: "2026-05-10T08:00:00Z",
      trust_tier: "reputable",
      weight: 0.22,
      ordinal: 1,
    },
    {
      id: "sig-3",
      source: "slack",
      title: "Champion mentioned 'wait until next quarter' twice",
      ts: "2026-05-09T16:00:00Z",
      trust_tier: "inferential",
      weight: 0.16,
      ordinal: 2,
    },
    {
      id: "sig-4",
      source: "calendar",
      title: "Renewal kickoff has no Beacon decision-maker attached",
      ts: "2026-05-08T14:00:00Z",
      trust_tier: "authoritative",
      weight: 0.14,
      ordinal: 3,
    },
    {
      id: "sig-5",
      source: "support",
      title: "Open P1 ticket on sync stability",
      ts: "2026-05-06T09:00:00Z",
      trust_tier: "reputable",
      weight: 0.10,
      ordinal: 4,
    },
  ],
};

export function detailForId(id: string): PredictionDetail {
  const row =
    ACTIVE_PREDICTIONS.find((p) => p.id === id) ??
    RESOLVED_PREDICTIONS.find((p) => p.id === id);
  if (!row) {
    return FORECAST_DETAIL_FIXTURE;
  }
  if (row.id === PREDICTION_BEACON.id) return FORECAST_DETAIL_FIXTURE;
  return {
    prediction: row,
    signals: FORECAST_DETAIL_FIXTURE.signals.slice(0, 3).map((s, i) => ({
      ...s,
      id: `${row.id}-sig-${i}`,
    })),
  };
}

export function mockCreatedPrediction(body: {
  statement: string;
  category: string;
  confidence: number;
  resolution_at: string;
  rationale?: string;
}): PredictionRow {
  return {
    id: `pred-new-${Math.floor(Math.random() * 100000)}`,
    tenant_id: TENANT,
    status: "active",
    statement: body.statement,
    rationale: body.rationale ?? null,
    category: (body.category ?? "strategy") as PredictionRow["category"],
    target_node_kind: null,
    target_node_id: null,
    target_label: null,
    confidence: body.confidence,
    confidence_basis: "User-authored scenario",
    falsification_condition: null,
    key_drivers: [],
    impact: {},
    resolution_at: body.resolution_at,
    resolved_at: null,
    outcome: null,
    resolution_timeliness: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
}
