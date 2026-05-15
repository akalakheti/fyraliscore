# Contract: Root-Route Gating & Outbound Navigation

**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md)

This is the only contract this feature introduces. It governs (a) what
renders at `/` and (b) where the landing page sends visitors.

---

## C-1 — Root-route gating

**Subject**: [ui/src/pages/RootRoute.tsx](../../../ui/src/pages/RootRoute.tsx) (new)
**Wired into**: [ui/src/main.tsx](../../../ui/src/main.tsx) replacing the current `<Route path="/" element={<DemoLanding />} />`.

### Input

- The browser's `localStorage` at first render of `RootRoute`.
- Specifically, the key `DEMO_LS_KEYS.sessionId` (current value: the string `"demoSessionId"`), defined in [ui/src/api/demo-picker-client.ts](../../../ui/src/api/demo-picker-client.ts).

### Behavior

| Condition at first render | Component rendered |
|---------------------------|--------------------|
| `localStorage.getItem("demoSessionId")` is `null` or empty string | `<LandingPage />` |
| `localStorage.getItem("demoSessionId")` is any non-empty string | `<DemoLanding />` (unchanged existing behavior) |
| `window`/`localStorage` is unavailable (SSR safety) | `<LandingPage />` (graceful fallback) |

### Invariants

- The gate is evaluated **once** per mount. The component does not subscribe to `storage` events.
- The gate does not mutate `localStorage`.
- The gate does not redirect. It chooses a child to render.

### Acceptance

- Verified by the Vitest unit test for `RootRoute` and the Playwright e2e flow in [../research.md#r7](../research.md#r7--testing-strategy).

---

## C-2 — Outbound CTAs and links

**Subject**: [ui/src/pages/LandingPage.tsx](../../../ui/src/pages/LandingPage.tsx) (new)

### Internal navigation (client-side)

All in-app destinations are rendered with `react-router-dom`'s `<Link to="...">` so they use the existing `BrowserRouter`. Full-page reloads MUST NOT occur for these.

| Where on the page | Target | Mechanism |
|-------------------|--------|-----------|
| Hero primary CTA | `/demo` | `<Link to="/demo">` |
| Closing CTA band | `/demo` | `<Link to="/demo">` |
| Footer link "Try the demo" (in Product group) | `/demo` | `<Link to="/demo">` |
| Hero secondary CTA "How it works" | `#how-it-works` (in-page anchor) | `<a href="#how-it-works">` — anchor scroll, no router involvement |

### External navigation (full nav, new tab)

| Where on the page | Target | Mechanism |
|-------------------|--------|-----------|
| Footer link "GitHub" | external repo URL (placeholder until prod URL is decided) | `<a href="..." target="_blank" rel="noopener noreferrer">` |
| Footer link "Documentation" | external docs URL or in-repo README anchor | `<a href="..." target="_blank" rel="noopener noreferrer">` if external; `<Link>` if internal |

### Invariants

- Every interactive element has an accessible name (visible text suffices).
- All `<a>` elements with `target="_blank"` carry `rel="noopener noreferrer"`.
- No CTA fires any analytics event. No CTA mutates `localStorage`. (Those concerns belong to the demo flow downstream.)

### Acceptance

- Vitest unit test asserts the primary CTA has `to="/demo"` and the closing CTA has `to="/demo"`.
- Playwright e2e clicks the primary CTA and asserts navigation to `/demo` plus the presence of the demo picker.

---

## C-3 — No new APIs

This feature exposes no HTTP endpoints, no message-bus events, no CLI
commands, and no shared library functions. Component-level shape is
documented in [data-model.md](../data-model.md); routing is documented
above. There are no additional contracts to enumerate.
