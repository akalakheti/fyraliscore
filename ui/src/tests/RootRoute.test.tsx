import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock DemoLanding so the test does not need to instantiate the cockpit's
// full dependency tree. We assert on this sentinel to confirm the gate
// chose the DemoLanding branch.
vi.mock("../pages/DemoLanding", () => ({
  default: () => <div data-testid="demo-landing-sentinel">demo-landing</div>,
}));

import RootRoute from "../pages/RootRoute";

beforeEach(() => {
  localStorage.clear();
});

describe("RootRoute", () => {
  it("renders the landing page when no demoSessionId is set", () => {
    render(
      <MemoryRouter>
        <RootRoute />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /fyralis/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("demo-landing-sentinel")
    ).not.toBeInTheDocument();
  });

  it("renders DemoLanding when demoSessionId is present", () => {
    localStorage.setItem("demoSessionId", "test-session");
    render(
      <MemoryRouter>
        <RootRoute />
      </MemoryRouter>
    );
    expect(screen.getByTestId("demo-landing-sentinel")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: /fyralis/i })
    ).not.toBeInTheDocument();
  });

  it("falls back to the landing page when localStorage access throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage unavailable");
    };
    try {
      render(
        <MemoryRouter>
          <RootRoute />
        </MemoryRouter>
      );
      expect(
        screen.getByRole("heading", { level: 1, name: /fyralis/i })
      ).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
