# Implementation Plan: Fyralis Landing Page

**Branch**: `feat/landing-page` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-landing-page/spec.md`

## Summary

Add a static marketing landing page to the existing `ui/` workspace that introduces Fyralis, explains the Today/Structure/History surfaces, lists features and supported integrations (Slack, Discord, GitHub), and routes visitors into the existing `/demo` flow. Visitors at `/` with no active demo session see the new page; visitors with an active session continue to render the cockpit unchanged. Implementation reuses the existing React 18 + Vite 5 + TypeScript 5 + Tailwind 3 stack, adds zero new npm dependencies, and ships with Vitest unit coverage and one Playwright e2e spec.

## Technical Context

**Language/Version**: TypeScript 5.5 (strict mode), targeting browsers (ES2020)
**Primary Dependencies**: React 18.3, react-router-dom 6.26, Tailwind 3.4 — all already in [ui/package.json](../../ui/package.json)
**Storage**: N/A — the page is static. It reads `localStorage` (existing `DEMO_LS_KEYS`) only for the active-demo-session gate
**Testing**: Vitest 2.1 for unit/component tests, Playwright 1.47 with `USE_MOCK=1` for e2e
**Target Platform**: Modern evergreen browsers (Chrome, Safari, Firefox, Edge) on desktop, tablet, mobile (≥320px width)
**Project Type**: Web application — single-page React app in [ui/](../../ui/)
**Performance Goals**: LCP ≤ 2.5s on local dev build; first paint of hero copy + CTA before any non-critical asset resolves
**Constraints**: No new top-level npm dependencies; no SSR; no analytics/lead capture; no external imagery fetched at runtime; CSS via existing Tailwind config + `index.css` only
**Scale/Scope**: Single new route + single new page component (~250 LOC TSX). One Playwright e2e spec. One Vitest unit spec.

## Constitution Check

The constitution (`.specify/memory/constitution.md` v1.0.0) is dominated by substrate-level invariants (foundations, migrations, RLS, audit chain, trust/confidence, region locks). This feature is a UI-only, read-only, content-static surface. Relevant principles and their evaluation:

| Principle | Applicability | Result |
|-----------|---------------|--------|
| I. Four Foundations Distinct (NON-NEGOTIABLE) | Not applicable — no substrate writes, no Models, no Observations, no Acts, no Resources. | PASS |
| II. Schema Is Append-Only (NON-NEGOTIABLE) | Not applicable — no migrations, no schema changes. | PASS |
| III. Tenant Isolation Is Structural (NON-NEGOTIABLE) | Not applicable — no tenant-scoped tables, no DB access. The page is unauthenticated. | PASS |
| IV. Integration Tests Use a Real Database (NON-NEGOTIABLE) | Not applicable — frontend-only change; the existing Playwright `USE_MOCK=1` regime covers UI e2e. No new backend tests. | PASS |
| V. Reasoning Separated From Rendering | Not applicable — no LLM use. | PASS |
| VI. Trust, Confidence, Falsifiers | Not applicable. | PASS |
| VII. Determinism, Idempotency, Audit | Not applicable — no substrate mutations. | PASS |
| VIII. Errors Carry Structured Context | Marginal — the page has no failure modes that surface errors to the user. PASS by default. | PASS |
| IX. Substrate Changes Are Dual-Write | Not applicable. | PASS |
| **X. Simplicity, YAGNI, No Premature Abstraction** | **Directly applies.** No new abstractions, no config knobs, no component library, no inline-CSS framework, no animation library. Static content as TSX constants in the page module. | PASS |
| Stack Constraints — Frontend (React 18 + Vite 5 + TS 5 + Tailwind 3) | Direct match. Vitest unit + Playwright e2e per stack constraints. | PASS |
| Dev Workflow — `npm run typecheck`, `npm test`, `npm run test:e2e` | Will run all three before merge per spec FR-014 and SC-006. | PASS |

**Initial Constitution Check: PASS — no violations, no Complexity Tracking entries needed.**

## Project Structure

### Documentation (this feature)

```text
specs/001-landing-page/
├── plan.md              # this file
├── spec.md              # feature specification
├── research.md          # phase 0 — design + content decisions
├── data-model.md        # phase 1 — static content shape + routing state
├── quickstart.md        # phase 1 — how to dev + test the page locally
├── contracts/
│   └── routing.md       # phase 1 — root-route gating contract + CTA targets
└── checklists/
    └── requirements.md  # spec quality checklist (already passing)
```

### Source Code (repository root)

```text
ui/
├── src/
│   ├── main.tsx                 # MODIFY — wire LandingPage into "/" via gating component
│   ├── pages/
│   │   ├── LandingPage.tsx      # NEW — the landing page itself (hero, surfaces, features, integrations, CTA band, footer)
│   │   ├── RootRoute.tsx        # NEW — small gate: renders LandingPage when no demo session, DemoLanding otherwise
│   │   └── DemoLanding.tsx      # UNCHANGED — still wraps <App /> when a session exists
│   └── tests/
│       └── LandingPage.test.tsx # NEW — Vitest: hero renders, CTA href, integrations visible
└── e2e/
    └── landing-page.spec.ts     # NEW — Playwright: root shows landing, CTA routes to /demo, session bypass
```

**Structure Decision**: Single-app frontend layout, additive only. The landing page lives next to existing `pages/*` files. A tiny `RootRoute` gating component is the minimum-viable change to [ui/src/main.tsx](../../ui/src/main.tsx) — it reads the same `DEMO_LS_KEYS.sessionId` that `DemoLanding` already reads, so the gate stays in lockstep with existing demo-session semantics.

## Phase 0: Research & Decisions

See [research.md](./research.md). Key decisions:

- **Where to add the page**: as a new route component under `ui/src/pages/`, mirroring the existing `DemoLanding`, `DemoPicker`, `Structure`, `History`, `MyMind` pattern.
- **How to gate**: introduce a `RootRoute` wrapper that reads `localStorage.getItem(DEMO_LS_KEYS.sessionId)` on first render and chooses between `<LandingPage />` and `<DemoLanding />`. We do **not** modify `DemoLanding` to avoid coupling its existing reset/end-demo flow to the marketing surface.
- **Styling**: Tailwind utility classes only, drawing from the existing tokens in [ui/tailwind.config.js](../../ui/tailwind.config.js) (`base`, `surface`, `ink`, `accent`, etc.) and the global rules in `ui/src/index.css`. No new CSS files.
- **Integration marks**: text labels for Slack / Discord / GitHub (no third-party logo SVGs — see spec assumption about brand-asset licensing). A small monogram per integration via inline Tailwind-styled `<span>` keeps the bundle clean and licence-free.
- **Motion**: no animation library. A single `prefers-reduced-motion: reduce` media query in inline classes (`motion-safe:transition` / `motion-reduce:transition-none`) covers the spec requirement.
- **Routing**: client-side via `react-router-dom`. CTAs use `<Link to="/demo">` for the primary CTA and a regular `<a href="...">` for external footer links (GitHub repo etc.).

## Phase 1: Design Artifacts

### Data model

See [data-model.md](./data-model.md). The page introduces no persistent entities. It declares two in-source TypeScript shapes:

- `LandingContent` — the static copy (headline, subhead, surfaces[], features[], integrations[], footerLinks[]). Authored as a module-scope constant.
- `RootRouteState` — a single piece of derived UI state: `hasDemoSession: boolean`, read from `localStorage` on mount.

### Contracts

See [contracts/routing.md](./contracts/routing.md). The single contract is the root-route gate behavior and the set of outbound navigation targets the page produces.

### Quickstart

See [quickstart.md](./quickstart.md). Covers: dev server (`npm run dev`), running the page in mock mode, running Vitest, running Playwright, and the manual responsive-viewport check at 320 / 375 / 768 / 1024 / 1440.

### Agent context update

This plan is the canonical reference; the project's [CLAUDE.md](../../CLAUDE.md) already points new work at "the current plan at specs/.../plan.md", so updating that pointer to [specs/001-landing-page/plan.md](./plan.md) is the only agent-context refresh required.

## Post-Design Constitution Check

Re-checked after Phase 1 design:

- No data model changes → Principle II/III pass.
- No substrate touches → Principles I, V–IX pass.
- The new abstractions are exactly two TypeScript types and one gating component. Principle X (Simplicity) holds — these earn their keep by being the minimum needed to satisfy FR-001/FR-002.
- All new code is covered by Vitest + Playwright per the frontend stack constraint.

**Post-Design Constitution Check: PASS.**

## Complexity Tracking

No constitution violations to justify. Table omitted.
