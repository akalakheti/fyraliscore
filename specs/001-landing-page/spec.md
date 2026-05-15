# Feature Specification: Fyralis Landing Page

**Feature Branch**: `feat/landing-page`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "Build a public landing page for Fyraliscore — the organizational intelligence runtime. The landing page is what unauthenticated visitors see at the root path before they enter the demo or product cockpit. It must communicate what Fyralis is, who it's for, and the core value proposition. The page needs: a hero section with product name, tagline, and primary CTA buttons that route to the existing /demo flow and to the product cockpit; a features section describing the key capabilities (recommendation feed, multi-tenant gateway, integrations like Slack/Discord/GitHub, asynchronous reasoning workers); a how-it-works/architecture overview section; a footer with links to GitHub and documentation. Visual style should match the existing minimalist Fyralis cockpit aesthetic. The page must be implemented as a new React route, named LandingPage.tsx under ui/src/pages/, and wired into the router so unauthenticated/non-demo visitors land here by default."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time visitor learns what Fyralis is and starts the demo (Priority: P1)

A prospective user, typically an engineering or operations lead, arrives at the root URL after seeing Fyralis mentioned in conversation, social media, or documentation. They have no prior context. Within seconds they need to grasp what the product is, recognize that it is meant for someone like them, and find a frictionless way to try it without creating an account.

**Why this priority**: This is the load-bearing journey. Without an effective first-touch surface, every downstream funnel (demo, sign-up, integration walkthroughs) starves. Every other story builds on the visitor reaching the hero, understanding the pitch, and converting to an active session.

**Independent Test**: A reviewer unfamiliar with the product can open the root URL, read the hero copy, click the primary CTA, and arrive at the demo picker within three clicks and under fifteen seconds — without needing prior knowledge.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor with no demo session, **When** they navigate to the root URL, **Then** they see the landing page with a clear product name, one-sentence tagline, supporting subhead, and a prominent primary CTA to start a demo.
2. **Given** a visitor on the landing page, **When** they click the primary "Try the demo" CTA, **Then** they are routed to the existing demo picker flow with no intermediate friction.
3. **Given** a visitor reading the hero, **When** they look for proof of what the product does, **Then** they can scroll to a features section that names at least four concrete capabilities in one screen height on a standard laptop viewport.

---

### User Story 2 - Returning user with an active demo session bypasses the landing page (Priority: P1)

A user who has already started a demo session in a previous visit returns to the root URL. They expect to land in the product, not be shown a marketing page again.

**Why this priority**: Showing a marketing wall to someone who has already converted is regressive. This must work on day one to avoid breaking the existing demo-deploy experience.

**Independent Test**: With a demo session in local storage, navigating to the root URL routes the visitor straight to the product cockpit without rendering the landing page.

**Acceptance Scenarios**:

1. **Given** a visitor with a stored demo session, **When** they navigate to the root URL, **Then** the product cockpit renders and the landing page is not shown.
2. **Given** a visitor who has ended their demo session, **When** they navigate to the root URL, **Then** the landing page is shown.

---

### User Story 3 - Visitor evaluating the product reads features and architecture before committing (Priority: P2)

A more cautious visitor — typically a technical evaluator or someone forwarded the link by a peer — wants to understand capabilities and the runtime architecture before clicking through to the demo. They scan for integrations, deployment shape, and trust signals.

**Why this priority**: Converts the "I'll forward this to my team" segment. Lower than P1 because it is downstream of the hero, but it is the difference between a casual click and a serious evaluation.

**Independent Test**: A reviewer can scroll past the hero and, without leaving the page, identify (a) the four core capabilities, (b) the high-level runtime architecture, and (c) which third-party platforms the product integrates with.

**Acceptance Scenarios**:

1. **Given** a visitor past the hero, **When** they scroll through the features section, **Then** they see at least four named capabilities, each with a one-sentence description.
2. **Given** a visitor in the architecture overview section, **When** they read it, **Then** they understand at a high level that Fyralis runs as a multi-tenant gateway with a data store, embeddings, async workers, and a UI cockpit — without needing to read external docs.
3. **Given** a visitor at the bottom of the page, **When** they look for further detail, **Then** the footer surfaces clearly labelled links to the public repository and the documentation entrypoint.

---

### User Story 4 - Visitor uses keyboard or assistive technology (Priority: P2)

A visitor relying on keyboard navigation, screen reader, or reduced-motion settings can consume the page and reach the primary CTA without barriers.

**Why this priority**: Accessibility is a baseline product expectation and is cheaper to bake in than retrofit. Lower than P1 because P1 stories already imply a usable surface, but explicitly listed so it is treated as acceptance criteria rather than aspiration.

**Independent Test**: Using only the keyboard and a screen reader, a tester can land on the hero, tab through to the primary CTA, activate it, and reach the demo flow.

**Acceptance Scenarios**:

1. **Given** a visitor navigating by keyboard, **When** they tab through the page, **Then** focus order follows visual order, all interactive elements have visible focus rings, and CTAs are reachable without traps.
2. **Given** a visitor using a screen reader, **When** the landing page loads, **Then** the page has a single H1, sections use semantic headings, and CTAs have descriptive accessible names.
3. **Given** a visitor with reduced-motion preferences set, **When** the page renders, **Then** decorative motion is suppressed or reduced.

---

### Edge Cases

- A visitor whose stored demo session is invalid or expired arrives at the root URL — the landing page should render rather than crash or redirect to a broken cockpit.
- A visitor opens the page on a narrow mobile viewport — the layout must remain legible, the primary CTA must remain reachable above the fold, and content must not horizontally overflow.
- A visitor's network is slow — meaningful hero content (product name, tagline, primary CTA) must be visible before any non-critical assets resolve.
- A visitor lands with browser JavaScript disabled — at minimum the hero copy and primary navigational links should still be readable (within the constraints of the existing SPA).
- A visitor clicks a footer link with no network — the link is still well-formed and opens cleanly; no broken UI states.
- A visitor arrives during a deploy where the demo backend is briefly unavailable — the CTA still navigates; downstream failure is owned by the demo flow itself, not the landing page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The landing page MUST render at the root URL for visitors with no active demo session.
- **FR-002**: The landing page MUST contain a hero section featuring the product name, a single-sentence tagline, a supporting subhead, a primary CTA to start the demo, and a secondary CTA to enter the product cockpit.
- **FR-003**: The primary CTA MUST navigate the visitor to the existing demo picker route.
- **FR-004**: The secondary CTA MUST navigate the visitor to the product cockpit route (the existing default app surface).
- **FR-005**: The landing page MUST contain a features section that names and describes at least four distinct core capabilities of Fyralis (recommendation feed, multi-tenant gateway, third-party integrations, asynchronous reasoning).
- **FR-006**: The landing page MUST contain a "how it works" / architecture overview section that conveys the runtime shape (gateway, data store, embeddings, async workers, UI cockpit) in plain language understandable to a technical reader without prior Fyralis exposure.
- **FR-007**: The landing page MUST contain a footer with a link to the public repository and a link to the documentation entrypoint.
- **FR-008**: When a visitor with a recognized active demo session navigates to the root URL, the system MUST route them directly to the cockpit and MUST NOT render the landing page.
- **FR-009**: The landing page MUST be responsive across mobile, tablet, and desktop viewports, with no horizontal overflow and with the primary CTA reachable without horizontal scrolling.
- **FR-010**: The landing page MUST meet baseline accessibility expectations: a single H1, semantic section headings, visible focus indicators on all interactive elements, accessible names for CTAs, and respect for the user's reduced-motion preference.
- **FR-011**: The landing page MUST visually align with the existing Fyralis cockpit aesthetic, reusing established color tokens, typography, and spacing conventions rather than introducing a parallel visual system.
- **FR-012**: The landing page MUST render its hero (product name, tagline, primary CTA) within a fast first-paint budget on a standard broadband connection, prioritizing inline-critical content over imagery or animation.
- **FR-013**: The landing page MUST be implemented as a new route within the existing UI application, named such that future routes/pages can discover it by convention.
- **FR-014**: The landing page MUST NOT alter or regress any existing route (`/demo`, debug surfaces, structure/history/mind pages, or the cockpit itself).

### Key Entities

- **Visitor**: A person arriving at the root URL. Has at most one of two states relevant here: has-active-demo-session or no-active-demo-session. The latter is the landing page audience.
- **Demo Session**: An existing concept owned by the demo flow, stored client-side, that indicates an in-progress product trial. The landing page treats its presence/absence as a routing signal only and does not mutate it.
- **Landing Section**: A logical block on the page (hero, features, how-it-works, footer). Each is independently scannable and contributes to the visitor's evaluation flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can identify what the product is and reach the demo flow in under 15 seconds from landing.
- **SC-002**: 100% of visitors with no active demo session who navigate to the root URL see the landing page; 100% of visitors with an active demo session bypass it and reach the cockpit directly.
- **SC-003**: The hero content (product name, tagline, primary CTA) is visible within the first viewport on screens ≥ 360px wide without scrolling.
- **SC-004**: The page meets WCAG 2.1 AA expectations for keyboard navigation, focus visibility, and semantic structure as verified by manual keyboard traversal and an automated accessibility audit reporting zero critical issues.
- **SC-005**: All interactive elements have a descriptive accessible name and reach interactive readiness on first paint without requiring additional script execution beyond what the existing SPA already loads.
- **SC-006**: Zero regressions in existing routes — every previously reachable surface remains reachable with no change in behavior.
- **SC-007**: The page renders correctly across a representative set of viewport widths (≥ 360px mobile, ≥ 768px tablet, ≥ 1280px desktop) with no horizontal scroll and with all CTAs reachable.

## Assumptions

- The existing UI application's router, styling tokens, and demo-session detection mechanisms are stable and can be reused; introducing a parallel system is out of scope.
- The landing page is content-static — no CMS, no fetched marketing copy, no A/B framework. Copy is authored inline and shipped with the bundle.
- No analytics or telemetry instrumentation is required in this iteration; if added later, it is a separate feature.
- No localization is required in this iteration; English copy ships first.
- No authentication, sign-up form, lead capture, or email collection is required on the landing page; the only conversion action is "start the demo."
- The "product cockpit" secondary CTA targets the existing default app route as it stands on the `demo-deploy` branch; the landing page does not redefine cockpit behavior.
- The footer's repository and documentation links point to existing destinations already used elsewhere in the project (README/repo URL). Confirming exact URLs is an implementation-time detail, not a scope question.
- Marketing imagery is optional; the page can ship text-first and remain on-brand using existing color and typography tokens.
- The page is a single-page scrollable layout; no multi-page marketing site, no separate pricing/about routes in this iteration.
