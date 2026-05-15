# Data Model: Fyralis Landing Page

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

The landing page introduces **no persistent entities**. It does not touch
Postgres, the Think pipeline, or any of the four substrate foundations. The
only "data" in play is (a) the static content authored as TypeScript
constants and (b) the existing demo-session flag in `localStorage`.

## In-source shapes

These types live at the top of `ui/src/pages/LandingPage.tsx` and are
consumed only by that file.

### `LandingContent`

```ts
type LandingContent = {
  brandName: string;                 // "Fyralis"
  eyebrow: string;                   // short tag above the H1 ("Organizational intelligence runtime")
  headline: string;                  // hero H1
  subhead: string;                   // one-sentence elaboration
  primaryCta: { label: string; to: string };   // { label: "Try the demo", to: "/demo" }
  secondaryCta: { label: string; href: string }; // anchor: { label: "How it works", href: "#how-it-works" }
  surfaces: Surface[];               // exactly 3: Today / Structure / History
  features: Feature[];               // ≥4 cards
  integrations: Integration[];       // includes Slack, Discord, GitHub
  closingCta: { label: string; to: string };   // mirrors primaryCta
  footer: FooterContent;
};

type Surface = {
  id: "today" | "structure" | "history";
  title: string;                     // "Today", "Structure", "History"
  description: string;               // one paragraph
};

type Feature = {
  title: string;                     // short
  description: string;               // one sentence
};

type Integration = {
  name: "Slack" | "Discord" | "GitHub" | string;
  monogram: string;                  // single letter for the chip
  tone: "slack" | "discord" | "github"; // maps to a Tailwind color class set
};

type FooterContent = {
  groups: FooterGroup[];             // ≥3 groups
  copyrightYear: number;             // e.g., 2026
};

type FooterGroup = {
  heading: string;                   // "Product" / "Resources" / "Company"
  links: FooterLink[];
};

type FooterLink = {
  label: string;
  href: string;                      // internal (starts with "/") or absolute URL
  external?: boolean;                // when true, opens in new tab
};
```

### `RootRouteState`

`ui/src/pages/RootRoute.tsx` derives one synchronous boolean from
`localStorage` on first render:

```ts
type RootRouteState = {
  hasDemoSession: boolean;           // truthy iff DEMO_LS_KEYS.sessionId is set
};
```

This is a render-time derivation, not state in the React-state sense. There
is no `useState` necessary unless we want to react to storage events from
other tabs — explicitly out of scope (the user navigating into a demo
should fully reload the cockpit via `<DemoLanding />` mounting anyway).

## Validation rules from the spec

Encoded as compile-time and runtime invariants in the page module:

| Source requirement | Where it's enforced |
|--------------------|---------------------|
| FR-003 hero composition (brand, headline, subhead, CTA) | `LandingContent` shape requires all four fields. |
| FR-005 surfaces section names Today/Structure/History | `Surface["id"]` literal union pins the set. |
| FR-006 ≥ 4 feature cards | Vitest unit test asserts `LANDING_CONTENT.features.length >= 4`. |
| FR-007 Slack/Discord/GitHub visible | Vitest unit test asserts the three names appear in `LANDING_CONTENT.integrations`. |
| FR-009 ≥ 3 footer groups | Vitest unit test asserts `LANDING_CONTENT.footer.groups.length >= 3`. |
| FR-004/FR-008/FR-015 CTAs route via client router | TS literal `to: "/demo"` + `<Link>` usage in the component. |

## State transitions

The page has no state machine.

The `RootRoute` gate has a trivial decision:

```text
on first render:
  if localStorage.getItem(DEMO_LS_KEYS.sessionId)  →  render <DemoLanding />
  else                                              →  render <LandingPage />
```

No transitions over time. A user starting a demo from the landing page
navigates to `/demo`, completes the picker, and is then routed elsewhere by
the existing demo flow; if they return to `/` after that, the gate's next
fresh evaluation correctly picks the cockpit branch because the demo flow
has populated the session key. Equivalent flow in reverse when the user
ends a demo session.
