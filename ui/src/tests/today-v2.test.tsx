import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import TodayBriefing from "@/pages/today-v2/Briefing";
import TodayFocusedReview from "@/pages/today-v2/FocusedReview";
import {
  TODAY_PAGE_FIXTURE,
  mockApply,
  mockCorrection,
  mockDelegate,
  mockGetDelta,
  mockGetEvidence,
  _resetTodayPageMock,
} from "@/api/today-page-mock";

// Mock the today-page-client module. We intercept at the module
// boundary so the hook stays untouched and we can assert on the wire
// calls. The implementation delegates to the shared mock fixture so
// status transitions look exactly like prod.
vi.mock("@/api/today-page-client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    body?: unknown;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  },
  getTodayPage: vi.fn(async () => ({ ...TODAY_PAGE_FIXTURE })),
  getDeltaDetail: vi.fn(async (id: string) => mockGetDelta(id)),
  getDeltaEvidence: vi.fn(async (id: string) => mockGetEvidence(id)),
  applyDelta: vi.fn(async (id: string) => mockApply(id)),
  delegateDelta: vi.fn(async (id: string, body) => mockDelegate(id, body)),
  submitCorrection: vi.fn(async (id: string, body) => mockCorrection(id, body)),
}));

function renderBriefing() {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route path="/today" element={<TodayBriefing />} />
        <Route path="/today/review/:deltaId" element={<TodayFocusedReview />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderFocused(deltaId: string) {
  return render(
    <MemoryRouter initialEntries={[`/today/review/${deltaId}`]}>
      <Routes>
        <Route path="/today" element={<TodayBriefing />} />
        <Route path="/today/review/:deltaId" element={<TodayFocusedReview />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  _resetTodayPageMock();
});

afterEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// Briefing Mode
// =====================================================================

describe("Today Briefing Mode", () => {
  it("renders header + summary strip + primary judgment + other items + handled panel", async () => {
    renderBriefing();
    await waitFor(() =>
      expect(screen.getByTestId("today-page")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("briefing-header")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("today-summary-strip")).toBeInTheDocument();
    expect(screen.getByTestId("primary-judgment")).toBeInTheDocument();
    expect(screen.getByTestId("other-judgment-panel")).toBeInTheDocument();
    expect(screen.getByTestId("handled-without-you-panel")).toBeInTheDocument();
    // Primary judgment shows the spec scenario.
    expect(
      within(screen.getByTestId("primary-judgment")).getByText(/Salesforce sync instability/i),
    ).toBeInTheDocument();
  });

  it("shows summary metrics from the wire fixture", async () => {
    renderBriefing();
    await waitFor(() => screen.getByTestId("today-summary-strip"));
    const strip = screen.getByTestId("today-summary-strip");
    expect(within(strip).getByText("98")).toBeInTheDocument(); // processed
    expect(within(strip).getByText("94")).toBeInTheDocument(); // absorbed
    expect(within(strip).getByText("4")).toBeInTheDocument();  // need judgment
    expect(within(strip).getByText("$2.04M")).toBeInTheDocument(); // exposure
  });

  it("shows the right status chip for the primary judgment", async () => {
    renderBriefing();
    await waitFor(() => screen.getByTestId("primary-judgment"));
    expect(screen.getByTestId("status-chip-needs_authority")).toBeInTheDocument();
  });

  it("clicking the primary judgment title navigates to focused review", async () => {
    const user = userEvent.setup();
    renderBriefing();
    await waitFor(() => screen.getByTestId("primary-judgment-open"));
    await user.click(screen.getByTestId("primary-judgment-open"));
    await waitFor(() =>
      expect(screen.getByTestId("focused-review-card")).toBeInTheDocument(),
    );
  });

  it("clicking an Other Judgment row navigates to focused review for that delta", async () => {
    const user = userEvent.setup();
    renderBriefing();
    await waitFor(() => screen.getByTestId("other-judgment-panel"));
    const pricingRow = screen.getByTestId("other-row-delta-other-pricing");
    await user.click(pricingRow);
    await waitFor(() =>
      expect(screen.getByTestId("focused-review-card")).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("focused-review-card")).getByText(
        /Assign owner for pricing model decision/i,
      ),
    ).toBeInTheDocument();
  });

  it("Accept change button triggers applyDelta", async () => {
    const user = userEvent.setup();
    const client = await import("@/api/today-page-client");
    renderBriefing();
    await waitFor(() => screen.getByTestId("primary-accept"));
    await user.click(screen.getByTestId("primary-accept"));
    await waitFor(() =>
      expect(client.applyDelta).toHaveBeenCalledWith("delta-primary-001"),
    );
    // Success toast appears.
    await waitFor(() =>
      expect(screen.getByTestId("today-toast")).toBeInTheDocument(),
    );
  });

  it("Delegate button opens the delegation sheet", async () => {
    const user = userEvent.setup();
    renderBriefing();
    await waitFor(() => screen.getByTestId("primary-delegate"));
    await user.click(screen.getByTestId("primary-delegate"));
    expect(screen.getByTestId("delegation-sheet")).toBeInTheDocument();
  });

  it("Report correction button opens the correction sheet", async () => {
    const user = userEvent.setup();
    renderBriefing();
    await waitFor(() => screen.getByTestId("primary-correct"));
    await user.click(screen.getByTestId("primary-correct"));
    expect(screen.getByTestId("correction-sheet")).toBeInTheDocument();
  });
});

// =====================================================================
// Focused Review Mode
// =====================================================================

describe("Today Focused Review Mode", () => {
  it("renders the focused review card for the URL delta", async () => {
    renderFocused("delta-primary-001");
    await waitFor(() =>
      expect(screen.getByTestId("focused-review-card")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Salesforce sync instability/i)).toBeInTheDocument();
  });

  it("renders the Current → Proposed diff with field names + transitions", async () => {
    renderFocused("delta-primary-001");
    await waitFor(() => screen.getByTestId("mini-diff"));
    const diff = screen.getByTestId("mini-diff");
    expect(within(diff).getAllByText(/risk level/i).length).toBeGreaterThan(0);
    expect(within(diff).getByText(/Watch/)).toBeInTheDocument();
    expect(within(diff).getByText(/Critical/)).toBeInTheDocument();
  });

  it("shows missing context list when present", async () => {
    renderFocused("delta-primary-001");
    await waitFor(() => screen.getByTestId("focused-review-card"));
    expect(screen.getByText(/No recent Beacon call transcript/i)).toBeInTheDocument();
  });

  it("shows 'No major context gaps' when missing context is empty", async () => {
    renderFocused("delta-other-pricing");
    await waitFor(() => screen.getByTestId("focused-review-card"));
    expect(
      screen.getByText(/No major context gaps identified/i),
    ).toBeInTheDocument();
  });

  it("Back to Today returns to briefing", async () => {
    const user = userEvent.setup();
    renderFocused("delta-primary-001");
    await waitFor(() => screen.getByTestId("focused-back"));
    await user.click(screen.getByTestId("focused-back"));
    await waitFor(() =>
      expect(screen.getByTestId("today-page")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("focused-review-card")).not.toBeInTheDocument();
  });

  it("Review evidence opens the evidence drawer with grouped sources", async () => {
    const user = userEvent.setup();
    renderFocused("delta-primary-001");
    await waitFor(() => screen.getByTestId("focused-review-evidence"));
    await user.click(screen.getByTestId("focused-review-evidence"));
    await waitFor(() =>
      expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument(),
    );
    // Drawer shows the per-source groups + a signal count.
    const drawer = screen.getByTestId("evidence-drawer");
    expect(within(drawer).getByText(/12 signals shown/i)).toBeInTheDocument();
    // Source filter + quality filter are present.
    expect(within(drawer).getAllByRole("combobox")).toHaveLength(2);
  });

  it("Accept in focused mode applies the delta and navigates onward", async () => {
    const user = userEvent.setup();
    const client = await import("@/api/today-page-client");
    renderFocused("delta-primary-001");
    await waitFor(() => screen.getByTestId("focused-accept"));
    await user.click(screen.getByTestId("focused-accept"));
    await waitFor(() =>
      expect(client.applyDelta).toHaveBeenCalledWith("delta-primary-001"),
    );
  });

  it("Correction sheet submits with explanation + type", async () => {
    const user = userEvent.setup();
    const client = await import("@/api/today-page-client");
    renderFocused("delta-primary-001");
    await waitFor(() => screen.getByTestId("focused-correct"));
    await user.click(screen.getByTestId("focused-correct"));
    await waitFor(() => screen.getByTestId("correction-sheet"));
    await user.click(screen.getByTestId("correction-type-already_handled"));
    await user.type(
      screen.getByLabelText(/Explanation/i),
      "We already handled this last week.",
    );
    await user.click(screen.getByTestId("correction-submit"));
    await waitFor(() =>
      expect(client.submitCorrection).toHaveBeenCalledWith(
        "delta-primary-001",
        expect.objectContaining({
          correctionType: "already_handled",
          explanation: "We already handled this last week.",
        }),
      ),
    );
  });
});
