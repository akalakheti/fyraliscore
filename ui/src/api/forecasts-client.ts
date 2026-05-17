// HTTP client for the Forecasts page surface.
// Endpoints live under /api when running against the Vite dev server
// (see vite.config.ts proxy). The mock-server.ts plugin (when wired)
// or page-level route() handlers serve these against the fixture in
// src/api/forecasts-mock.ts.

import { ApiError } from "./client";
import { getAuthHeader, handleAuthFailure } from "./auth";
import type {
  AccuracyResponse,
  CreateScenarioBody,
  ForecastCategory,
  ForecastSort,
  ForecastStatus,
  ListResponse,
  PredictionDetail,
  PredictionRow,
  RiskExposureResponse,
  SummaryResponse,
  UpcomingResponse,
} from "./forecasts-types";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function request<T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...getAuthHeader(),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
    signal,
  });
  if (!res.ok) {
    if (res.status === 401) handleAuthFailure();
    throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

export interface ListParams {
  status?: ForecastStatus;
  category?: ForecastCategory;
  sort?: ForecastSort;
  limit?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export function listForecasts(
  params: ListParams = {},
  signal?: AbortSignal
): Promise<ListResponse> {
  const q = buildQuery({
    status: params.status ?? "active",
    category: params.category,
    sort: params.sort ?? "earliest_resolution",
    limit: params.limit,
  });
  return request<ListResponse>(`/v1/forecasts/${q}`, undefined, signal);
}

export function getSummary(signal?: AbortSignal): Promise<SummaryResponse> {
  return request<SummaryResponse>("/v1/forecasts/summary", undefined, signal);
}

export function getForecast(
  id: string,
  signal?: AbortSignal
): Promise<PredictionDetail> {
  return request<PredictionDetail>(
    `/v1/forecasts/${encodeURIComponent(id)}`,
    undefined,
    signal
  );
}

export function getAccuracy(
  rangeDays = 180,
  signal?: AbortSignal
): Promise<AccuracyResponse> {
  return request<AccuracyResponse>(
    `/v1/forecasts/accuracy?range_days=${rangeDays}`,
    undefined,
    signal
  );
}

export function getRiskExposure(
  metric = "arr_at_risk",
  days = 90,
  signal?: AbortSignal
): Promise<RiskExposureResponse> {
  const q = buildQuery({ metric, days });
  return request<RiskExposureResponse>(
    `/v1/forecasts/risk_exposure${q}`,
    undefined,
    signal
  );
}

export function getUpcoming(
  days = 14,
  signal?: AbortSignal
): Promise<UpcomingResponse> {
  return request<UpcomingResponse>(
    `/v1/forecasts/upcoming?days=${days}`,
    undefined,
    signal
  );
}

export function createScenario(
  body: CreateScenarioBody,
  signal?: AbortSignal
): Promise<PredictionRow> {
  return request<PredictionRow>(
    "/v1/forecasts/",
    { method: "POST", body: JSON.stringify(body) },
    signal
  );
}

export { ApiError };
