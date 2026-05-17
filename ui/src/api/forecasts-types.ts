// Forecasts page contract — mirrors services/forecasts/router.py +
// services/forecasts/repo.py + accuracy.py response shapes.
// Backend is the source of truth; treat as read-only structures.

export type ForecastStatus = "active" | "resolved" | "superseded";

export type ForecastCategory =
  | "customer_risk"
  | "capacity"
  | "delivery"
  | "strategy"
  | "decision"
  | "pricing"
  | "partner";

export type ForecastOutcome = "true" | "false" | "partial";

export type ForecastTimeliness = "early" | "on_time" | "late";

export type ForecastSort =
  | "earliest_resolution"
  | "latest_resolution"
  | "highest_confidence"
  | "created";

export interface KeyDriver {
  title: string;
  delta?: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface ForecastImpact {
  // Backend stores impact as a jsonb blob; common keys:
  arr_at_risk?: number;
  customers_affected?: number;
  capacity_pct?: number;
  // Free-form extension.
  [k: string]: unknown;
}

export interface PredictionRow {
  id: string;
  tenant_id: string;
  status: ForecastStatus;
  statement: string;
  rationale: string | null;
  category: ForecastCategory;
  target_node_kind: string | null;
  target_node_id: string | null;
  target_label: string | null;
  confidence: number;
  confidence_basis: string | null;
  falsification_condition: string | null;
  key_drivers: KeyDriver[];
  impact: ForecastImpact;
  resolution_at: string;
  resolved_at: string | null;
  outcome: ForecastOutcome | null;
  resolution_timeliness: ForecastTimeliness | null;
  created_at: string;
  updated_at: string;
}

export interface PredictionSignal {
  id: string;
  source: string;
  title: string;
  ts: string;
  trust_tier: string | null;
  weight: number | null;
  ordinal: number;
}

export interface PredictionDetail {
  prediction: PredictionRow;
  signals: PredictionSignal[];
}

export interface ListResponse {
  items: PredictionRow[];
  count: number;
}

export interface SummaryResponse {
  active_count: number;
  at_risk_arr: number;
  high_confidence_count: number;
  upcoming_resolutions_count_14d: number;
  model_calibration: number | null;
  calibration_delta: number | null;
}

export interface AccuracyBin {
  bin_label: string;
  predicted_rate: number;
  observed_hit_rate: number | null;
  n_resolved: number;
}

export interface AccuracyRecentResolution {
  id: string;
  statement: string;
  category: ForecastCategory;
  confidence: number;
  outcome: ForecastOutcome;
  resolution_timeliness: ForecastTimeliness | null;
  resolved_at: string;
  resolution_at: string;
}

export interface AccuracyResponse {
  bins: AccuracyBin[];
  recent_resolutions: AccuracyRecentResolution[];
  calibration_summary: {
    value: number | null;
    delta_vs_last_week: number | null;
    n_resolved_total: number;
  };
}

export interface RiskBucket {
  bucket_start: string;
  bucket_end: string;
  value: number;
}

export interface RiskExposureResponse {
  metric: string;
  range_days: number;
  buckets: RiskBucket[];
}

export interface UpcomingResponse {
  items: PredictionRow[];
  count: number;
  days: number;
}

export interface CreateScenarioBody {
  statement: string;
  category: ForecastCategory;
  confidence: number;
  resolution_at: string;
  rationale?: string;
  target_label?: string;
  falsification_condition?: string;
  impact?: ForecastImpact;
  key_drivers?: KeyDriver[];
}
