# Quickstart: Fyralis Landing Page

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

How to develop, preview, and test the landing page locally.

## 1. Prerequisites

- Node 20+
- The `ui/` workspace already has its dependencies installed (`cd ui && npm install` if not).

## 2. Run the dev server

The landing page does not need the backend to render. Use the mock-server mode so the page is fully exercised without spinning up Postgres / Ollama / the gateway:

```bash
cd ui
USE_MOCK=1 npm run dev
```

Open http://localhost:5173 in a browser. With no demo session keys in `localStorage`, you should see the landing page. To verify the bypass, in DevTools console run:

```js
localStorage.setItem("demoSessionId", "test")
location.reload()
```

You should now see the cockpit (the existing `DemoLanding` → `App` chain).

To switch back, run:

```js
localStorage.removeItem("demoSessionId")
location.reload()
```

## 3. Unit tests (Vitest)

```bash
cd ui
npm test
```

This runs all Vitest specs. The landing-page-specific specs are:

- `ui/src/tests/LandingPage.test.tsx` — page-level assertions
- `ui/src/tests/RootRoute.test.tsx` — gate behavior

You can target just these:

```bash
npm test -- LandingPage
npm test -- RootRoute
```

## 4. End-to-end tests (Playwright)

```bash
cd ui
npm run test:e2e -- landing-page
```

The spec at `ui/e2e/landing-page.spec.ts` exercises three flows:

1. **First-time visitor** — clears localStorage, navigates to `/`, asserts hero copy is visible.
2. **CTA conversion** — clicks primary "Try the demo" CTA, asserts URL becomes `/demo` and the demo picker renders.
3. **Returning visitor with session** — pre-seeds `localStorage.demoSessionId`, navigates to `/`, asserts the landing-page hero is *not* visible.

Playwright runs against the Vite dev server in mock mode automatically (per [ui/playwright.config.ts](../../ui/playwright.config.ts)).

## 5. Typecheck

```bash
cd ui
npm run typecheck
```

Must pass before committing per the constitution's frontend dev-workflow gate.

## 6. Manual responsive check

Open the landing page in DevTools' device mode and verify there is no horizontal scroll and no clipped content at each of these widths:

| Width | Notes |
|------:|-------|
| 320px | Smallest supported mobile |
| 375px | iPhone SE / mini |
| 768px | Tablet portrait |
| 1024px | Tablet landscape / small laptop |
| 1440px | Standard desktop |

This matches `SC-003` in [spec.md](./spec.md).

## 7. Optional — Lighthouse / LCP check

For `SC-005` (LCP ≤ 2.5s), run a Lighthouse audit in Chrome DevTools against `http://localhost:5173/` in mobile + desktop modes. Anything over 2.5s on a local build is a regression worth investigating before merge.
