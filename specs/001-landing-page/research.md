# Research & Decisions: Fyralis Landing Page

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

This document resolves every choice that was implicit in the spec so that
`tasks.md` can be generated mechanically.

## R1 — Where the page lives in the existing UI

**Decision**: New file at [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx), wired into the existing `BrowserRouter` in [ui/src/main.tsx](../../ui/src/main.tsx).

**Rationale**:
- The repo already follows a `ui/src/pages/<PageName>.tsx` convention (`DemoLanding`, `DemoPicker`, `Structure`, `History`, `MyMind`). Following it keeps discoverability and tooling (path aliases, lint configs) trivial.
- No new top-level route grouping, no nested route layout, no lazy loading. Vite bundles the whole SPA today; one extra page is negligible.

**Alternatives considered**:
- *Separate Vite project under `marketing/`*: rejected — doubles deploy and routing complexity, no benefit at v1 scope.
- *Inline the marketing copy into `DemoLanding`*: rejected — `DemoLanding` exists to wrap `<App />` with the demo session bar; conflating the two would couple unrelated state and force every UI test to deal with two surfaces at once.

## R2 — How the root route chooses between LandingPage and the cockpit

**Decision**: Add a tiny `RootRoute` wrapper component at [ui/src/pages/RootRoute.tsx](../../ui/src/pages/RootRoute.tsx) that, on first render, reads `localStorage.getItem(DEMO_LS_KEYS.sessionId)`. If truthy, render `<DemoLanding />` (which already handles the cockpit + demo-session bar). Otherwise render `<LandingPage />`. Wire `<Route path="/" element={<RootRoute />} />` in [ui/src/main.tsx](../../ui/src/main.tsx) in place of the current `<DemoLanding />` direct mount.

**Rationale**:
- `DemoLanding` already reads the same key; the new behaviour just adds one branch upstream. Existing demo flows continue to render `DemoLanding → App` unchanged.
- The check is synchronous (`localStorage`); no flash of one screen before the other.
- The wrapper is ~15 LOC. It keeps `DemoLanding` and `LandingPage` independent.

**Alternatives considered**:
- *Modify `DemoLanding` to render `<LandingPage />` instead of `navigate("/demo")` when no session*: rejected — `DemoLanding` is a session-state surface; loading the entire marketing surface inside it makes its responsibility ambiguous and complicates the existing `navigate("/demo")` end-of-session path.
- *Use `<Navigate>` to redirect `/` to `/landing` or `/home`*: rejected — adds a route the user has to learn about, and the redirect flicker is visible.

## R3 — Styling and design tokens

**Decision**: Tailwind utility classes only, drawing from the existing tokens in [ui/tailwind.config.js](../../ui/tailwind.config.js). No new CSS file, no new tailwind plugin, no new font.

**Token reuse plan**:
- Background: `bg-base` (page) / `bg-surface` (cards) / `bg-surface-soft` (alternating section)
- Text: `text-ink` (primary), `text-ink-3` (secondary body), `text-ink-4` (eyebrow / footer meta)
- Accent: `text-accent`, `bg-accent`, `hover:bg-accent-hover` (primary CTA), `bg-accent-faint` (chip backgrounds)
- Rules: `border-rule-faint` / `border-rule-soft`
- Fonts: `font-serif` (display headlines), `font-sans` (body, CTAs, UI), `font-mono` (code-style snippets if any)
- Radii: `rounded-lg` / `rounded-2xl` for hero card + CTA buttons

**Rationale**: The cockpit, debug, and demo surfaces already use these tokens; matching them is the cheapest path to "feels like the same product." Spec FR-011 makes this a requirement.

**Alternatives considered**:
- *Introduce a `marketing.css` with bespoke variables*: rejected — duplicates the design system and risks drift.

## R4 — Integration marks (Slack, Discord, GitHub)

**Decision**: Show each integration as a chip — a small inline-SVG monogram (a stylized letter inside a colored rounded square) plus a text label ("Slack", "Discord", "GitHub"). No third-party brand SVGs.

**Rationale**:
- The spec explicitly notes that licensing third-party logos is out of scope for v1 (assumption block).
- Monogram chips keep the bundle small, work offline, and avoid licensing review.
- The chip remains immediately recognizable because the text label sits next to the mark.

**Alternatives considered**:
- *Use third-party brand SVGs (e.g., from simple-icons)*: rejected for v1 due to licensing review needed.
- *Show only text labels*: rejected — visually weak for the integrations section.

## R5 — Hero composition and "above the fold" layout

**Decision**:
- Desktop (≥1024px): 60/40 split — left column has eyebrow tag, H1 (`font-serif text-5xl`), subhead (`text-ink-3 text-xl`), and two CTAs (primary "Try the demo", secondary "Learn how it works" anchor scroll); right column has a stylized "card stack" preview built from divs (no images) showing what a Today card looks like.
- Tablet (768–1023px): single column, CTAs stacked, preview card below the headline.
- Mobile (320–767px): single column, all elements full-width, CTAs full-width buttons.

**Rationale**: The hero must be self-contained (FR-003) and above the fold on a 1440×900 desktop and within first scroll on a 375×812 mobile (Story 1 independent test). A composed preview-card visual provides product feel without needing screenshots.

**Alternatives considered**:
- *Hero with a screenshot of the cockpit*: rejected — couples the marketing page to a specific UI revision; screenshots go stale.
- *Hero with no visual at all (text-only)*: rejected — fails the "scannable in 30s" goal (SC-001) by being visually flat.

## R6 — Motion and reduced-motion

**Decision**:
- Section reveals on scroll: a single `IntersectionObserver` adding a CSS class for `opacity` + `translate-y` transition. Class is added once and never removed.
- Wrap motion in `motion-safe:` Tailwind variants so `prefers-reduced-motion: reduce` users skip all transitions.

**Rationale**: Single observer + CSS transitions is ~30 LOC, no library, satisfies FR-012 and SC-005.

**Alternatives considered**:
- *Framer Motion*: rejected — new top-level dependency (violates SC-006).
- *No motion at all*: acceptable but rejected because subtle reveals materially improve scan-ability without cost.

## R7 — Testing strategy

**Decision**:
- **Vitest unit test** ([ui/src/tests/LandingPage.test.tsx](../../ui/src/tests/LandingPage.test.tsx)): renders `<LandingPage />`, asserts (a) presence of the H1, (b) the primary CTA's `href` resolves to `/demo`, (c) Slack/Discord/GitHub labels appear, (d) footer renders at least three link groups.
- **Vitest unit test** for `RootRoute`: renders with no `demoSessionId` → shows landing; with a session id → shows DemoLanding (or its child surface, mocked).
- **Playwright e2e** ([ui/e2e/landing-page.spec.ts](../../ui/e2e/landing-page.spec.ts)): three flows —
  1. `/` shows the landing page when localStorage is empty.
  2. Clicking the primary CTA navigates to `/demo` and shows the demo picker.
  3. With `localStorage.setItem("demoSessionId", "x")` pre-seeded, navigating to `/` does not render the landing hero.

**Rationale**: Vitest covers component-level guarantees (FR-003/FR-006/FR-007/FR-009); Playwright covers the routing/integration guarantees (FR-001/FR-002/FR-004/FR-014). This split mirrors how `Structure` and `History` are already tested in this repo.

**Alternatives considered**:
- *Only Playwright*: rejected — slower feedback for unit-level changes.
- *Only Vitest*: rejected — Playwright is the only honest test of the React Router + localStorage gate.

## R8 — Content authoring

**Decision**: All copy lives as a `const LANDING_CONTENT: LandingContent` at the top of `LandingPage.tsx`. No CMS, no JSON file, no i18n framework.

**Rationale**:
- Spec assumption: "Copy is authored inline and shipped with the bundle."
- Keeping copy in TS lets the type-checker enforce structure (e.g., every feature has a title + description; every integration has a name + monogram color).

**Alternatives considered**:
- *External JSON file*: rejected — TS gives stronger guarantees with no benefit at this scope.
