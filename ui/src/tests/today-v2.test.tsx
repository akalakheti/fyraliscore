import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import TodayBriefing from "@/pages/today-v2/Briefing";
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

const PRIMARY_ID = "delta-primary-001";
const PRICING_ID = "delta-other-pricing";

function renderBriefing(initialEntry = "/today") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/today" element={<TodayBriefing />} />
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
// Briefing Mode — default landing (spec §4)
// =====================================================================

describe("Today — Briefing Mode", () => {
  it("renders the briefing header, Fyralis Brief, Primary Judgment preview, Other items, Handled Without You", async () => {
    renderBriefing();
    await screen.findByTestId("primary-preview");
    expect(screen.getByTestId("briefing-header")).toBeInTheDocument();
    expect(screen.getByTestId("fyralis-brief")).toBeInTheDocument();
    expect(screen.getByTestId("primary-preview")).toBeInTheDocument();
    expect(screen.getByTestId("other-items")).toBeInTheDocument();
    expect(screen.getByTestId("handled-without-you-panel")).toBeInTheDocument();
    // The focused review sheet should not exist in Briefing Mode.
    expect(screen.queryByTestId(`focused-review-${PRIMARY_ID}`)).toBeNull();
    expect(screen.queryByTestId("review-mode")).toBeNull();
  });

  it("briefing header shows the attention receipt from the wire fixture", async () => {
    renderBriefing();
    await screen.findByTestId("briefing-header");
    const header = screen.getByTestId("briefing-header");
    expect(within(header).getByText(/Fyralis reviewed the company/i)).toBeInTheDocument();
    expect(within(header).getByText(/signals processed/i)).toBeInTheDocument();
    expect(within(header).getByText(/absorbed/i)).toBeInTheDocument();
    expect(within(header).getByText(/need your judgment/i)).toBeInTheDocument();
  });

  it("primary judgment preview shows the title and CTA", async () => {
    renderBriefing();
    const preview = await screen.findByTestId("primary-preview");
    expect(within(preview).getByText(/Salesforce sync instability/i)).toBeInTheDocument();
    expect(within(preview).getByTestId("primary-preview-review")).toBeInTheDocument();
  });

  it("clicking the preview CTA enters Review Mode (URL adds ?review=<id>)", async () => {
    const user = userEvent.setup();
    renderBriefing();
    await screen.findByTestId("primary-preview-review");
    await user.click(screen.getByTestId("primary-preview-review"));

    await waitFor(() =>
      expect(screen.getByTestId("review-mode")).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`focused-review-${PRIMARY_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId("review-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("primary-preview")).toBeNull();
  });

  it("clicking an Other Item row enters Review Mode for that delta", async () => {
    const user = userEvent.setup();
    renderBriefing();
    await screen.findByTestId("other-items");
    await user.click(screen.getByTestId(`other-row-${PRICING_ID}`));
    await waitFor(() =>
      expect(screen.getByTestId(`focused-review-${PRICING_ID}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("review-mode")).toBeInTheDocument();
  });
});

// =====================================================================
// Review Mode — deep link + behavior (spec §5–§14)
// =====================================================================

describe("Today — Review Mode", () => {
  it("deep link /today?review=<id> enters Review Mode directly", async () => {
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-review-${PRIMARY_ID}`);
    expect(screen.getByTestId("review-mode")).toBeInTheDocument();
    expect(screen.queryByTestId("primary-preview")).toBeNull();
  });

  it("review rail shows all items and Handled Without You stats", async () => {
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId("review-rail");
    const rail = screen.getByTestId("review-rail");
    expect(within(rail).getByTestId(`rail-row-${PRIMARY_ID}`)).toBeInTheDocument();
    expect(within(rail).getByTestId(`rail-row-${PRICING_ID}`)).toBeInTheDocument();
  });

  it("clicking another rail row swaps focus without leaving Review Mode", async () => {
    const user = userEvent.setup();
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-review-${PRIMARY_ID}`);
    await user.click(screen.getByTestId(`rail-row-${PRICING_ID}`));
    await waitFor(() =>
      expect(screen.getByTestId(`focused-review-${PRICING_ID}`)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(`focused-review-${PRIMARY_ID}`)).toBeNull();
    expect(screen.getByTestId("review-mode")).toBeInTheDocument();
  });

  it("Collapse review exits to Briefing Mode", async () => {
    const user = userEvent.setup();
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-collapse-${PRIMARY_ID}`);
    await user.click(screen.getByTestId(`focused-collapse-${PRIMARY_ID}`));
    await waitFor(() =>
      expect(screen.queryByTestId("review-mode")).toBeNull(),
    );
    expect(screen.getByTestId("primary-preview")).toBeInTheDocument();
  });

  it("Ask Fyralis suggestions render and a stubbed typed answer appears inline", async () => {
    const user = userEvent.setup();
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`ask-strip-${PRIMARY_ID}`);
    expect(screen.getByTestId("ask-suggestion-why_now")).toBeInTheDocument();
    await user.click(screen.getByTestId("ask-suggestion-why_now"));
    await waitFor(() =>
      expect(screen.getByTestId(`ask-answer-${PRIMARY_ID}`)).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId(`ask-answer-${PRIMARY_ID}`)).getByRole("heading", {
        name: /Why now/i,
      }),
    ).toBeInTheDocument();
  });

  it("Review evidence opens the evidence drawer in place", async () => {
    const user = userEvent.setup();
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-review-evidence-${PRIMARY_ID}`);
    await user.click(screen.getByTestId(`focused-review-evidence-${PRIMARY_ID}`));
    await waitFor(() =>
      expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("today-page")).toBeInTheDocument();
  });

  it("Accept change triggers applyDelta", async () => {
    const user = userEvent.setup();
    const client = await import("@/api/today-page-client");
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-accept-${PRIMARY_ID}`);
    await user.click(screen.getByTestId(`focused-accept-${PRIMARY_ID}`));
    await waitFor(() =>
      expect(client.applyDelta).toHaveBeenCalledWith(PRIMARY_ID),
    );
  });

  it("Delegate opens the delegation sheet", async () => {
    const user = userEvent.setup();
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-delegate-${PRIMARY_ID}`);
    await user.click(screen.getByTestId(`focused-delegate-${PRIMARY_ID}`));
    expect(screen.getByTestId("delegation-sheet")).toBeInTheDocument();
  });

  it("Report correction opens the correction sheet", async () => {
    const user = userEvent.setup();
    renderBriefing(`/today?review=${PRIMARY_ID}`);
    await screen.findByTestId(`focused-correct-${PRIMARY_ID}`);
    await user.click(screen.getByTestId(`focused-correct-${PRIMARY_ID}`));
    expect(screen.getByTestId("correction-sheet")).toBeInTheDocument();
  });
});
