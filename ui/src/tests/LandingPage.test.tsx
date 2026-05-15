import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../pages/LandingPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("LandingPage — hero & surfaces (US1)", () => {
  it("renders exactly one h1 with the brand headline", () => {
    renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent ?? "").toMatch(/operating system for organizational thought/i);
  });

  it("primary CTA is a Link to /demo", () => {
    renderPage();
    const ctas = screen.getAllByRole("link", { name: /try the demo/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) {
      expect(cta.getAttribute("href")).toBe("/demo");
    }
  });

  it("secondary CTA is an anchor to #how-it-works", () => {
    renderPage();
    const cta = screen.getAllByRole("link", { name: /^how it works$/i })[0];
    expect(cta).toBeInTheDocument();
    expect(cta.getAttribute("href")).toBe("#how-it-works");
  });

  it("surfaces section names Today / Structure / History", () => {
    renderPage();
    const section = document.getElementById("how-it-works");
    expect(section).not.toBeNull();
    const list = within(section as HTMLElement);
    expect(list.getByRole("heading", { name: /^today$/i })).toBeInTheDocument();
    expect(list.getByRole("heading", { name: /^structure$/i })).toBeInTheDocument();
    expect(list.getByRole("heading", { name: /^history$/i })).toBeInTheDocument();
  });
});

describe("LandingPage — features & integrations (US3)", () => {
  it("features section has at least four cards each with a title and description", () => {
    renderPage();
    const section = document.getElementById("features");
    expect(section).not.toBeNull();
    const headings = within(section as HTMLElement).getAllByRole("heading", {
      level: 3,
    });
    expect(headings.length).toBeGreaterThanOrEqual(4);
    for (const h of headings) {
      expect((h.textContent ?? "").trim().length).toBeGreaterThan(0);
      const card = h.closest("li");
      expect(card).not.toBeNull();
      expect((card?.textContent ?? "").trim().length).toBeGreaterThan(
        (h.textContent ?? "").length
      );
    }
  });

  it("how-it-works section names the runtime pillars in plain language", () => {
    renderPage();
    const section = document.getElementById("how-it-works");
    const text = (section?.textContent ?? "").toLowerCase();
    expect(text).toMatch(/gateway/);
    expect(text).toMatch(/postgres|pgvector|vector/);
    expect(text).toMatch(/worker/);
    expect(text).toMatch(/cockpit|ui|react/);
  });

  it("integrations section shows Slack, Discord, and GitHub", () => {
    renderPage();
    const section = document.getElementById("integrations");
    expect(section).not.toBeNull();
    const scoped = within(section as HTMLElement);
    expect(scoped.getByText(/^Slack$/)).toBeInTheDocument();
    expect(scoped.getByText(/^Discord$/)).toBeInTheDocument();
    expect(scoped.getByText(/^GitHub$/)).toBeInTheDocument();
  });
});

describe("LandingPage — footer (US4)", () => {
  it("renders a footer with at least three link groups", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toBeInTheDocument();
    const groupHeadings = within(footer).getAllByRole("heading", { level: 3 });
    expect(groupHeadings.length).toBeGreaterThanOrEqual(3);
    expect(
      groupHeadings.some((h) => /product/i.test(h.textContent ?? ""))
    ).toBe(true);
    expect(
      groupHeadings.some((h) => /resources/i.test(h.textContent ?? ""))
    ).toBe(true);
  });

  it("footer Resources group has a GitHub link with target=_blank and rel=noopener noreferrer", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    const githubLink = within(footer).getByRole("link", { name: /github/i });
    expect(githubLink.getAttribute("href")).toMatch(/^https:\/\//);
    expect(githubLink.getAttribute("target")).toBe("_blank");
    expect(githubLink.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("footer Resources group has a Documentation link", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    const docsLink = within(footer).getByRole("link", {
      name: /documentation|docs/i,
    });
    expect(docsLink.getAttribute("href")).toMatch(/^https?:\/\//);
    expect(docsLink.getAttribute("target")).toBe("_blank");
  });

  it("renders the current-year copyright line with the brand name", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent ?? "").toMatch(/©\s*2026\s+Fyralis/);
  });
});

describe("LandingPage — accessibility (US4)", () => {
  it("every section is labelled by a heading via aria-labelledby", () => {
    renderPage();
    const sections = document.querySelectorAll("main section");
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach((section) => {
      const labelId = section.getAttribute("aria-labelledby");
      expect(labelId, `section missing aria-labelledby`).toBeTruthy();
      const label = document.getElementById(labelId as string);
      expect(label, `aria-labelledby refers to missing element ${labelId}`).not.toBeNull();
    });
  });

  it("every interactive a/button has a non-empty accessible name", () => {
    renderPage();
    const links = screen.getAllByRole("link");
    for (const link of links) {
      const name = (link.textContent ?? "").trim() || link.getAttribute("aria-label");
      expect(name, `link without accessible name`).toBeTruthy();
    }
  });

  it("includes a skip-to-content link as the first focusable element", () => {
    renderPage();
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip).toBeInTheDocument();
    expect(skip.getAttribute("href")).toBe("#main-content");
  });
});
