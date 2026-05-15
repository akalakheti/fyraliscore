# Tasks: Fyralis Landing Page

**Input**: Design documents from `specs/001-landing-page/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/routing.md](./contracts/routing.md), [quickstart.md](./quickstart.md)

**Tests**: Vitest unit + Playwright e2e are required per [plan.md](./plan.md) and the constitution's frontend dev-workflow gate.

**Organization**: Tasks are grouped by user story so each can be implemented and verified independently. The MVP is User Story 1 + User Story 2 (they share the same surface and are co-dependent for first-paint utility).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete dependency — safe to run in parallel.
- **[Story]**: User story this task belongs to (US1, US2, US3, US4).
- File paths are absolute-from-repo-root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing `ui/` workspace is buildable. No new tooling.

- [X] T001 Verify `ui/` deps install cleanly: run `cd ui && npm install` and `npm run typecheck` against the current `demo-deploy`-derived branch. No code changes — this is a smoke gate.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Land the routing scaffolding that all user stories rely on. After this phase, `/` still behaves the same as `demo-deploy` (no visible regression), but the gate component exists and is unit-tested.

**⚠️ CRITICAL**: No user-story implementation begins until T002 + T003 are merged green.

- [X] T002 Create the gating component at [ui/src/pages/RootRoute.tsx](../../ui/src/pages/RootRoute.tsx). It reads `DEMO_LS_KEYS.sessionId` from `localStorage` once on mount and renders `<DemoLanding />` when truthy or a stub `<LandingPage />` import when falsy. The stub component can be a single placeholder element for now — its real implementation lands in Phase 3.
- [X] T003 Wire `RootRoute` into the router at [ui/src/main.tsx](../../ui/src/main.tsx): replace `<Route path="/" element={<DemoLanding />} />` with `<Route path="/" element={<RootRoute />} />`. Keep all other routes untouched.
- [X] T004 [P] Add a stub page file [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx) exporting a default React component returning a single `<main>` with the H1 text "Fyralis" — minimum needed for `RootRoute` to import and for typecheck to pass. Real content lands in T011/T012.
- [X] T005 [P] Add the Vitest spec [ui/src/tests/RootRoute.test.tsx](../../ui/src/tests/RootRoute.test.tsx) covering: (a) no `demoSessionId` → renders the landing surface (assert on its H1); (b) `localStorage.setItem("demoSessionId", "x")` → renders DemoLanding (mock the DemoLanding module to expose a sentinel).
- [X] T006 Run `cd ui && npm run typecheck && npm test -- RootRoute` and confirm green.

**Checkpoint**: `/` still renders the cockpit for demo users; for fresh visitors it now renders the stub LandingPage. The gate is unit-tested. Phase 3 can begin in parallel with Phase 4 (shared file `LandingPage.tsx` forces some serialization within Phase 3, but Phase 4 — the gate behavior — is already covered).

---

## Phase 3: User Story 1 — First-time visitor learns what Fyralis is (Priority: P1) 🎯 MVP

**Goal**: A fresh visitor with no demo session lands at `/`, sees a hero (brand, headline, subhead, primary CTA), and can scroll to the surfaces (Today / Structure / History) overview within one viewport scroll.

**Independent Test**: Clear `localStorage`, visit `/` in `USE_MOCK=1 npm run dev`. Assert the H1 ("Fyralis") and the primary CTA button are visible above the fold on a 1440×900 viewport; scroll once on a 375×812 viewport and assert the three surface labels appear.

### Implementation for User Story 1

- [ ] T007 [US1] Define the `LandingContent` / `Surface` / `Feature` / `Integration` / `FooterContent` / `FooterGroup` / `FooterLink` types at the top of [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx) as documented in [data-model.md](./data-model.md). Export none — these are private to the page module.
- [ ] T008 [US1] Author the `LANDING_CONTENT: LandingContent` constant in [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx) with concrete copy: brand "Fyralis", eyebrow "Organizational intelligence runtime", a headline + one-sentence subhead, surfaces array of exactly three entries (`today`, `structure`, `history`) each with one-paragraph descriptions sourced from the spec's product framing, and stub features/integrations/footer arrays (filled in by US2/US3/US4 tasks).
- [ ] T009 [US1] Render the hero section in `LandingPage.tsx`: brand mark + eyebrow + H1 (`font-serif`) + subhead (`text-ink-3`) + primary CTA (`<Link to="/demo">Try the demo</Link>` styled `bg-accent text-white rounded-lg`) + secondary CTA `<a href="#how-it-works">`. Tailwind classes only; reuse tokens from [ui/tailwind.config.js](../../ui/tailwind.config.js). Mobile-first responsive layout per [research.md#r5](./research.md#r5--hero-composition-and-above-the-fold-layout).
- [ ] T010 [US1] Render the "How it works" / Surfaces section anchored at `#how-it-works` in `LandingPage.tsx`: a three-column grid on desktop (`md:grid-cols-3`), single column on mobile, each column showing surface title + one-paragraph description from `LANDING_CONTENT.surfaces`.
- [ ] T011 [US1] Add a `motion-safe` fade-up reveal: a single `IntersectionObserver` in a `useEffect` adds an `is-visible` class to each `section[data-reveal]`. Apply Tailwind `motion-safe:opacity-0 motion-safe:translate-y-2 motion-safe:transition` defaults and override with `is-visible:opacity-100 is-visible:translate-y-0` (use plain class toggling — no library).
- [ ] T012 [US1] Add Vitest spec [ui/src/tests/LandingPage.test.tsx](../../ui/src/tests/LandingPage.test.tsx). Assertions: hero H1 contains "Fyralis"; primary CTA `to` prop equals `/demo`; secondary CTA `href` equals `#how-it-works`; the three surface titles "Today", "Structure", "History" all appear.
- [ ] T013 [US1] Run `cd ui && npm run typecheck && npm test -- LandingPage` green.

**Checkpoint**: A first-time visitor can read the hero and surfaces overview. The page renders without errors. Acceptance scenarios 1.1 and 1.3 pass.

---

## Phase 4: User Story 2 — Visitor converts into a demo request (Priority: P1)

**Goal**: Both the hero primary CTA and a closing-band CTA route the visitor to `/demo`. Returning visitors with an active session bypass the landing page.

**Independent Test**: In the running dev server, with `localStorage` cleared, click the hero "Try the demo" CTA — URL becomes `/demo` and the existing demo picker renders. Then `localStorage.setItem("demoSessionId", "x"); location.reload()` — the landing hero is no longer visible; the cockpit renders.

### Implementation for User Story 2

- [ ] T014 [US2] Render a closing CTA band in [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx) below the integrations section. Contains a short headline ("Ready to try it?") and a single primary CTA `<Link to="/demo">Try the demo</Link>` with the same styling as the hero CTA.
- [ ] T015 [US2] Confirm RootRoute behavior — `/` shows landing for fresh visitors, cockpit for demo users — by extending [ui/src/tests/RootRoute.test.tsx](../../ui/src/tests/RootRoute.test.tsx) with an assertion that the landing path imports `<LandingPage />` (not the stub), wiring the real module.
- [ ] T016 [US2] Add Playwright e2e spec [ui/e2e/landing-page.spec.ts](../../ui/e2e/landing-page.spec.ts) with three scenarios per [research.md#r7](./research.md#r7--testing-strategy):
  1. Clear localStorage → navigate to `/` → assert H1 visible.
  2. Click primary CTA → assert URL is `/demo` → assert demo picker visible (re-use selectors already exercised in `ui/e2e/demo-live.spec.ts`).
  3. Pre-seed `localStorage.demoSessionId = "x"` via `page.addInitScript(...)` → navigate to `/` → assert the landing hero H1 is not visible.
- [ ] T017 [US2] Run `cd ui && npm run test:e2e -- landing-page` green.

**Checkpoint**: Acceptance scenarios 2.1, 2.2, 2.3 pass. SC-002 and SC-004 verified.

---

## Phase 5: User Story 3 — Visitor evaluates features and integrations (Priority: P2)

**Goal**: The page lists at least four feature cards in a grid and visibly includes Slack / Discord / GitHub as supported integrations.

**Independent Test**: Visit `/` in the running dev server. Scroll to the features grid — count at least four cards each with a title and description. Scroll to the integrations section — see Slack, Discord, and GitHub each rendered as a recognizable chip.

### Implementation for User Story 3

- [ ] T018 [US3] Populate `LANDING_CONTENT.features` in [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx) with exactly six feature entries drawn from the spec narrative: prioritized signal feed, decision tracking, asynchronous reasoning, multi-tenant gateway, integrations ingestion, audit-grade history. Each with a short title and a one-sentence description.
- [ ] T019 [US3] Render the features grid section in `LandingPage.tsx`: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`. Each card uses `bg-surface border border-rule-faint rounded-lg p-6`, an inline mini-mark, the title (`font-serif text-lg`), and the description (`text-ink-3 text-sm`).
- [ ] T020 [US3] Populate `LANDING_CONTENT.integrations` with three entries: `Slack` / `S` / "slack", `Discord` / `D` / "discord", `GitHub` / `G` / "github". The `tone` field maps to a Tailwind class lookup in the renderer.
- [ ] T021 [US3] Render the integrations section in `LandingPage.tsx`: horizontal flex on desktop, wraps on mobile. Each integration is a chip — `rounded-lg bg-surface border border-rule-faint px-4 py-3` containing a colored monogram square and the name. Tone-to-color map lives as a small `const TONE_CLASSES: Record<Integration["tone"], string>` in the file.
- [ ] T022 [US3] Extend [ui/src/tests/LandingPage.test.tsx](../../ui/src/tests/LandingPage.test.tsx) with assertions: `LANDING_CONTENT.features.length >= 4`; the rendered DOM contains the text "Slack", "Discord", "GitHub".
- [ ] T023 [US3] Run `cd ui && npm test -- LandingPage` green.

**Checkpoint**: Acceptance scenarios 3.1, 3.2, 3.3 pass. SC-003 partially verified (responsive grid reflow).

---

## Phase 6: User Story 4 — Visitor uses the footer (Priority: P3)

**Goal**: Page footer presents brand mark, copyright, and three groups of links with valid `href`s.

**Independent Test**: Visit `/`, scroll to the bottom — see the Fyralis brand mark, a copyright line ("© 2026 Fyralis"), and at least three groups of links (e.g., Product / Resources / Company). Click an internal link (e.g., "Try the demo" in the Product group) — navigates without full-page reload.

### Implementation for User Story 4

- [ ] T024 [US4] Populate `LANDING_CONTENT.footer` in [ui/src/pages/LandingPage.tsx](../../ui/src/pages/LandingPage.tsx) with three groups: **Product** (Try the demo → `/demo`, How it works → `#how-it-works`), **Resources** (Documentation → README link, GitHub → repo URL, external), **Company** (About → `#`, Contact → `mailto:` link). Set `copyrightYear: new Date().getFullYear()`.
- [ ] T025 [US4] Render the footer section in `LandingPage.tsx` below the closing CTA band: `border-t border-rule-faint pt-12 pb-8` with a 4-column desktop layout (brand + 3 link groups) collapsing to single column on mobile. External links open in a new tab with `rel="noopener noreferrer"`; internal `/` links use `<Link>`.
- [ ] T026 [US4] Extend [ui/src/tests/LandingPage.test.tsx](../../ui/src/tests/LandingPage.test.tsx) with assertions: `LANDING_CONTENT.footer.groups.length >= 3`; the rendered DOM contains the brand name, the copyright character "©", and the strings "Product", "Resources", "Company".
- [ ] T027 [US4] Run `cd ui && npm test -- LandingPage` green.

**Checkpoint**: Acceptance scenarios 4.1, 4.2 pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the success criteria, run all gates, and capture any rough edges before merge.

- [ ] T028 [P] Accessibility pass: verify the page has exactly one `<h1>`, all sections use `<section>` with semantic headings, all interactive elements are reachable by keyboard with visible focus rings (Tailwind `focus-visible:ring-2`), and `prefers-reduced-motion: reduce` suppresses the fade-up transitions. Manual test in Chrome DevTools.
- [ ] T029 [P] Responsive sweep at 320 / 375 / 768 / 1024 / 1440 widths per [quickstart.md §6](./quickstart.md#6-manual-responsive-check). Fix any horizontal-scroll or clipping issues found.
- [ ] T030 [P] Lighthouse run on `/` against the dev build — capture LCP for the record; flag if > 2.5s.
- [ ] T031 Run the full UI test gate: `cd ui && npm run typecheck && npm test && npm run test:e2e`. All green required before merge.
- [ ] T032 [P] Verify no new dependency was added: `git diff demo-deploy -- ui/package.json ui/package-lock.json` shows no `dependencies` / `devDependencies` additions beyond what already exists. (SC-006.)
- [ ] T033 Update top-of-spec status: mark [spec.md](./spec.md) `Status:` to `Implemented` once T031 passes.

---

## Dependency Graph

```text
T001 (setup smoke)
  └─ T002 RootRoute ────┬─ T003 main.tsx wire
                        └─ T004 stub LandingPage (parallel with T003)
                        └─ T005 RootRoute test (parallel with T003/T004)
                        └─ T006 typecheck+test (after T002–T005)

T006 ──► US1 (T007 → T008 → T009 → T010 → T011 → T012 → T013)
T013 ──► US2 (T014 → T015 → T016 → T017)
T017 ──► US3 (T018 → T019 → T020 → T021 → T022 → T023)
                       └─ US3 entirely edits LandingPage.tsx + LandingPage.test.tsx,
                          so its internal tasks must run serially within US3.
T023 ──► US4 (T024 → T025 → T026 → T027)
T027 ──► Polish (T028, T029, T030, T032 parallel; then T031; then T033)
```

## Parallel Opportunities

- **Within Phase 2**: T004 and T005 can run in parallel after T002 lands; T003 is independent of both (different file).
- **Across user stories**: Each story phase edits the same `LandingPage.tsx` (except US2's e2e in `ui/e2e/`). Within a story, serialize. Across stories, sequence as above.
- **Polish phase**: T028, T029, T030, T032 are independent observation/verification tasks and run in parallel.

## Implementation Strategy

- **MVP scope** = Phase 2 + Phase 3 + Phase 4 (US1 + US2). Delivers a working landing page that converts to `/demo` and bypasses returning demo users. This is the smallest cut that delivers business value (SC-001, SC-002, SC-004).
- **Incremental delivery**: ship Phase 5 (US3) and Phase 6 (US4) in follow-up commits on the same branch. Each phase keeps the page green and shippable on its own.
- **Polish phase** runs once at the end. Accessibility and responsive sweeps catch the long tail.

## Format Validation

All tasks above conform to: `- [ ] TXXX [P?] [Story?] Description with file path`. Setup, Foundational, and Polish phases omit the `[Story]` label as required. Each task has exactly one checkbox, one task ID, and either an explicit file path or a runnable command path.
