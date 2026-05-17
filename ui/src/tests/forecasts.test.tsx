import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ForecastsPage from "../pages/forecasts/Forecasts";
import {
  FORECASTS_ACCURACY_FIXTURE,
  FORECASTS_LIST_FIXTURE,
  FORECASTS_RESOLVED_FIXTURE,
  FORECASTS_RISK_EXPOSURE_FIXTURE,
  FORECASTS_SUMMARY_FIXTURE,
  FORECASTS_UPCOMING_FIXTURE,
  detailForId,
  mockCreatedPrediction,
} from "../api/forecasts-mock";

// Pin "now" so date math is deterministic.
beforeEach(() => {
  (window as unknown as { __FYRALIS_NOW__: string }).__FYRALIS_NOW__ =
    "2026-05-15T14:18:00Z";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface FetchMockState {
  postedScenarios: unknown[];
  failNext: Set<string>;
  emptyActive: boolean;
}

function mountFetchMock(state: FetchMockState) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      const shouldFail = (key: string) => state.failNext.has(key);

      if (url.includes("/v1/forecasts/summary") && method === "GET") {
        if (shouldFail("summary")) return new Response("err", { status: 500 });
        return new Response(JSON.stringify(FORECASTS_SUMMARY_FIXTURE), {
          status: 200,
        });
      }
      if (url.includes("/v1/forecasts/accuracy") && method === "GET") {
        if (shouldFail("accuracy")) return new Response("err", { status: 500 });
        return new Response(JSON.stringify(FORECASTS_ACCURACY_FIXTURE), {
          status: 200,
        });
      }
      if (url.includes("/v1/forecasts/risk_exposure") && method === "GET") {
        if (shouldFail("risk")) return new Response("err", { status: 500 });
        return new Response(JSON.stringify(FORECASTS_RISK_EXPOSURE_FIXTURE), {
          status: 200,
        });
      }
      if (url.includes("/v1/forecasts/upcoming") && method === "GET") {
        return new Response(JSON.stringify(FORECASTS_UPCOMING_FIXTURE), {
          status: 200,
        });
      }
      if (method === "POST" && /\/v1\/forecasts\/?($|\?)/.test(url)) {
        const body = JSON.parse((init?.body as string) ?? "{}");
        state.postedScenarios.push(body);
        return new Response(JSON.stringify(mockCreatedPrediction(body)), {
          status: 201,
        });
      }
      const detailMatch = url.match(/\/v1\/forecasts\/([^/?]+)(?:\?|$)/);
      if (method === "GET" && detailMatch && detailMatch[1] !== "summary" &&
          detailMatch[1] !== "accuracy" &&
          detailMatch[1] !== "risk_exposure" &&
          detailMatch[1] !== "upcoming") {
        const id = decodeURIComponent(detailMatch[1]);
        return new Response(JSON.stringify(detailForId(id)), { status: 200 });
      }
      if (url.includes("/v1/forecasts") && method === "GET") {
        const isResolved = url.includes("status=resolved");
        if (shouldFail("list")) return new Response("err", { status: 500 });
        if (state.emptyActive && !isResolved) {
          return new Response(
            JSON.stringify({ items: [], count: 0 }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify(
            isResolved ? FORECASTS_RESOLVED_FIXTURE : FORECASTS_LIST_FIXTURE
          ),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    })
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/forecasts"]}>
      <ForecastsPage />
    </MemoryRouter>
  );
}

describe("Forecasts page", () => {
  it("active tab renders summary strip, predictions, risk chart, upcoming list", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: false,
    };
    mountFetchMock(state);
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("What Fyralis believes may happen next.")).toBeInTheDocument()
    );

    // Summary cells (5)
    await waitFor(() =>
      expect(screen.getAllByText(/Active predictions/i).length).toBeGreaterThan(0)
    );
    expect(screen.getByText(/At-risk ARR/i)).toBeInTheDocument();
    expect(screen.getByText(/High confidence/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Upcoming resolutions/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Model calibration/i)).toBeInTheDocument();

    // Predictions list — six rows from fixture
    await waitFor(() => {
      const rows = screen.getAllByTestId("prediction-row");
      expect(rows.length).toBe(FORECASTS_LIST_FIXTURE.items.length);
    });

    // Risk chart present
    expect(screen.getByTestId("risk-exposure-svg")).toBeInTheDocument();

    // Upcoming list
    expect(screen.getByTestId("upcoming-card")).toBeInTheDocument();
    expect(screen.getAllByTestId("upcoming-row").length).toBeGreaterThan(0);
  });

  it("switching to Resolved tab fetches and renders resolved predictions", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: false,
    };
    mountFetchMock(state);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("prediction-row").length).toBeGreaterThan(0)
    );

    await user.click(screen.getByTestId("forecasts-tab-resolved"));

    await waitFor(() => {
      const list = screen.getByTestId("resolved-list");
      expect(within(list).getAllByTestId("resolved-row").length).toBe(
        FORECASTS_RESOLVED_FIXTURE.items.length
      );
    });
  });

  it("switching to Accuracy tab renders calibration bins", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: false,
    };
    mountFetchMock(state);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("prediction-row").length).toBeGreaterThan(0)
    );

    await user.click(screen.getByTestId("forecasts-tab-accuracy"));

    await waitFor(() => expect(screen.getByTestId("accuracy-panel")).toBeInTheDocument());
    const bins = screen.getByTestId("accuracy-bins");
    expect(within(bins).getByText("50-60")).toBeInTheDocument();
    expect(within(bins).getByText("90-100")).toBeInTheDocument();
  });

  it("clicking a prediction opens the inspector with title, confidence bar, drivers", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: false,
    };
    mountFetchMock(state);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("prediction-row").length).toBeGreaterThan(0)
    );

    // Inspector auto-opens on first prediction (Beacon).
    await waitFor(() =>
      expect(
        screen.getAllByText(/Beacon renewal at risk/i).length
      ).toBeGreaterThan(0)
    );
    expect(screen.getByTestId("confidence-thumb")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-drivers")).toBeInTheDocument();

    // Click a different row.
    const rows = screen.getAllByTestId("prediction-row");
    await user.click(rows[1]); // Engineering capacity
    await waitFor(() =>
      expect(
        screen.getAllByText(/Engineering capacity will exceed 90%/i).length
      ).toBeGreaterThan(0)
    );
  });

  it("+ New scenario button opens the dialog", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: false,
    };
    mountFetchMock(state);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("prediction-row").length).toBeGreaterThan(0)
    );

    const buttons = screen.getAllByRole("button", { name: /New scenario/i });
    await user.click(buttons[0]);
    expect(screen.getByTestId("new-scenario-dialog")).toBeInTheDocument();
  });

  it("submitting the dialog calls POST and refetches", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: false,
    };
    mountFetchMock(state);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByTestId("prediction-row").length).toBeGreaterThan(0)
    );

    const buttons = screen.getAllByRole("button", { name: /New scenario/i });
    await user.click(buttons[0]);
    expect(screen.getByTestId("new-scenario-dialog")).toBeInTheDocument();

    const statement = screen.getByTestId("new-scenario-statement");
    await user.type(statement, "Pricing committee will ratify in 14 days");

    const submit = screen.getByTestId("new-scenario-submit");
    await user.click(submit);

    await waitFor(() => expect(state.postedScenarios.length).toBe(1));
    const body = state.postedScenarios[0] as { statement: string };
    expect(body.statement).toMatch(/Pricing committee/);
  });

  it("empty active list renders an empty state", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(),
      emptyActive: true,
    };
    mountFetchMock(state);
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/No active predictions/i)).toBeInTheDocument()
    );
  });

  it("error response renders an error state for predictions", async () => {
    const state: FetchMockState = {
      postedScenarios: [],
      failNext: new Set(["list"]),
      emptyActive: false,
    };
    mountFetchMock(state);
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Couldn't load predictions/i)).toBeInTheDocument()
    );
  });

  it("loading state appears before fetches resolve", async () => {
    // Stub fetch with a never-resolving promise to verify the loading
    // copy renders.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    renderPage();
    await act(async () => {
      // Let React flush effects.
    });
    expect(screen.getByText(/Loading predictions/i)).toBeInTheDocument();
  });
});
