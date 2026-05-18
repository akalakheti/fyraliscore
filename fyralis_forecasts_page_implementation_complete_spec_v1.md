# Fyralis Forecasts Page — Implementation-Complete Specification v1.0

**Status:** Build-ready implementation specification  
**Page:** Forecasts  
**Primary question:** What is forming, what may happen, and what can change it?  
**Owner:** Product / Design / Frontend  
**Intended reader:** Frontend engineer, design engineer, product engineer, backend/API engineer

---

## 0. Purpose of This Document

This document is the complete implementation specification for the Fyralis **Forecasts** page.

It expands the previous design direction into a build-ready spec with:

- exact page purpose
- final information architecture
- visual hierarchy
- component anatomy
- layout dimensions
- design tokens
- page modes
- interaction contracts
- state machines
- lifecycle rules
- data contracts
- Ask Fyralis behavior
- empty/loading/error states
- accessibility requirements
- responsive behavior
- QA and acceptance criteria

A developer should be able to build the page from this document without guessing.

---

## 1. Product Architecture Context

Fyralis has four primary pages:

```text
Today      → What needs my judgment now?
Model      → What is currently true across the company?
Forecasts  → What is forming, what may happen, and what can change it?
Ledger     → What happened, what resolved, and how accurate was Fyralis?
```

The Forecasts page owns:

```text
Forecasts
Patterns
Anomalies
Leading indicators
Scenarios
Falsifiers
Intervention levers
Accuracy / calibration
Resolution windows
```

The Forecasts page must **not** become a list of predictions. It must feel like a **foresight surface**.

It should give the user a new dimension of value:

> Fyralis can see weak futures forming before they become current reality.

---

## 2. Core User Value

The page must help the user answer:

1. What futures are forming?
2. Which forecasts resolve soon?
3. What patterns are driving them?
4. What leading indicators matter?
5. What would change Fyralis’ mind?
6. What intervention could improve the outcome?
7. How accurate has Fyralis been historically?

The user should leave the page thinking:

> “I can see what may happen next, why Fyralis thinks so, what would change it, and what I can do.”

---

## 3. Non-Goals

The Forecasts page must not be:

- a generic analytics dashboard
- a queue of actions
- a copy of Today
- a copy of Model
- a graph/map of current company state
- a raw list of predictions
- a magical oracle screen
- a calendar-only forecast page
- a collection of disconnected charts

If the page starts feeling like “forecast cards plus charts,” it has failed the product intent. Congratulations, you made a weather app for corporate anxiety.

---

## 4. Final Page Structure

The Forecasts page uses this top-level structure:

```text
Global Sidebar
  ↓
Forecasts Header
  ↓
Foresight Brief
  ↓
Mode Selector
  ↓
Main Forecast Workspace
    ├─ Forecast Horizon Matrix
    └─ Foresight Inspector
  ↓
Pattern Field
  ↓
Accuracy & Resolution Strip
```

Default mode is **Horizon Mode**.

---

## 5. Page Modes

Forecasts has four modes:

```text
Horizon
Patterns
Scenarios
Accuracy
```

### 5.1 Horizon Mode

Default mode.

Purpose:

> Show what may happen, when it may resolve, and what is driving it.

Visible components:

- Forecasts Header
- Foresight Brief
- Forecast Horizon Matrix
- Foresight Inspector
- Pattern Field
- Accuracy & Resolution Strip

### 5.2 Patterns Mode

Purpose:

> Show recurring dynamics that are strengthening, weakening, or emerging.

Visible components:

- Forecasts Header
- Pattern Overview
- Pattern Cluster Grid
- Selected Pattern Inspector
- Related Forecasts
- Source Coverage
- Ask Fyralis for Patterns

### 5.3 Scenarios Mode

Purpose:

> Let users ask “what if” questions and compare possible interventions.

Visible components:

- Scenario Builder
- Suggested Scenario Prompts
- Scenario Cards
- Scenario Comparison
- Create Proposed Change CTA

### 5.4 Accuracy Mode

Purpose:

> Show whether Fyralis has been right and how calibrated it has been.

Visible components:

- Accuracy Summary
- Resolved Forecast Table
- Calibration Chart
- Accuracy by Domain
- Links to Ledger events

---

## 6. Global Layout and Dimensions

### 6.1 Overall Page Grid

```css
.forecasts-page {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--moon-paper);
}
```

### 6.2 Main Content Container

```css
.forecasts-main {
  max-width: 1480px;
  margin: 0 auto;
  padding: 36px 48px 48px;
}
```

### 6.3 Standard Vertical Rhythm

```css
.section-spacing-sm { margin-top: 16px; }
.section-spacing-md { margin-top: 24px; }
.section-spacing-lg { margin-top: 32px; }
.section-spacing-xl { margin-top: 44px; }
```

### 6.4 Main Workspace Grid

```css
.forecast-workspace {
  display: grid;
  grid-template-columns: minmax(620px, 1.05fr) minmax(460px, 0.95fr);
  gap: 28px;
  align-items: start;
}
```

Left column:
- Forecast Horizon Matrix
- Pattern Field

Right column:
- Foresight Inspector

Bottom:
- Accuracy & Resolution Strip, full width

---

## 7. Visual Tokens

### 7.1 Core Palette

```css
:root {
  --deep-forest: #071713;
  --forest-shadow: #132623;

  --moon-paper: #F7F2EA;
  --porcelain-mist: #FFFDF7;
  --soft-stone: #F5EFE4;
  --stone-veil: #DDD7CB;

  --root-ink: #17201B;
  --weathered-sage: #768177;

  --moss-cipher: #3E6A57;
  --living-moss: #4F8A6A;

  --antique-gold: #C9A35A;

  --deep-garnet: #7F2F29;
  --garnet-wash: #F7E8E3;

  --lapis: #315A7A;
  --lapis-wash: #E8F0F7;

  --veiled-iris: #6D678B;
  --iris-wash: #EFEDF7;
}
```

### 7.2 Forecast-Specific Color Semantics

```text
Veiled Iris:
uncertainty, patterns, scenario mode, probabilistic future

Deep Lapis:
evidence, leading indicators, source grounding

Deep Garnet:
material downside risk, worsening future state

Antique Gold:
intervention opportunity, pending judgment, uncertainty requiring attention

Moss:
improving forecast, grounded evidence, resolved positive

Deep Forest:
sidebar, primary action, highest brand grounding

Moon Paper:
page background

Porcelain Mist:
primary cards and surfaces
```

### 7.3 Radius Tokens

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-pill: 999px;
```

### 7.4 Shadow Tokens

```css
--shadow-card:
  0 12px 36px rgba(20, 28, 24, 0.05),
  0 1px 4px rgba(20, 28, 24, 0.04);

--shadow-focus:
  0 24px 80px rgba(20, 28, 24, 0.08),
  0 2px 8px rgba(20, 28, 24, 0.05);
```

### 7.5 Typography Tokens

```css
--font-display: "Your Serif Display", Georgia, serif;
--font-body: "Your Sans", Inter, system-ui, sans-serif;
```

Recommended sizes:

```css
.page-title {
  font-family: var(--font-display);
  font-size: 44px;
  line-height: 1.05;
  letter-spacing: -0.025em;
  color: var(--root-ink);
}

.brief-statement {
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 1.45;
  color: var(--root-ink);
}

.selected-forecast-title {
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.015em;
}

.body-text {
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.6;
}

.metadata {
  font-size: 13px;
  line-height: 1.4;
  color: var(--weathered-sage);
}

.micro-label {
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--weathered-sage);
}
```

Use uppercase labels sparingly. Do not make the page feel like a bureaucratic shrine.

---

## 8. Global Sidebar

Same sidebar as Today and Model.

### 8.1 Sidebar Content

```text
Fyralis logo

Primary nav:
- Today
- Model
- Forecasts
- Ledger

Shortcuts:
- Commitments
- Customers
- Risks
- Decisions
- Owners
- Teams

Utilities:
- Ask Fyralis
- Sources
- Settings

Status:
- LIVE
- All systems normal
- sparkline

User:
- avatar
- name
- profile affordance
```

### 8.2 Active State

Forecasts active.

```css
.nav-item.active {
  background: rgba(79, 138, 106, 0.18);
  border-left: 3px solid var(--living-moss);
  color: var(--porcelain-mist);
}
```

### 8.3 Sidebar Background

```css
.sidebar {
  background: var(--deep-forest);
  color: var(--porcelain-mist);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}
```

Subtle forest atmosphere allowed. Keep it dim and low-contrast.

---

## 9. Forecasts Header

### 9.1 Purpose

Set page role and scope.

### 9.2 Layout

```text
Forecasts

What Fyralis sees forming.
18 active forecasts · 5 resolve in 14 days · 4 patterns accelerating · 71% calibrated accuracy

                                   Ask Fyralis | Horizon: 90 days | Filters
```

### 9.3 Header Structure

```tsx
<ForecastsHeader>
  <Title>Forecasts</Title>
  <Subtitle>What Fyralis sees forming.</Subtitle>
  <InlineStats />
  <HeaderActions />
</ForecastsHeader>
```

### 9.4 Inline Stats

Stats should be inline, not big cards.

```text
18 active forecasts · 5 resolve in 14 days · 4 patterns accelerating · 71% calibrated accuracy
```

### 9.5 Header Controls

- Ask Fyralis input
- Horizon dropdown
- Filters button
- optional user avatar

#### Ask Input

Placeholder:

```text
Ask about forecasts, patterns, or scenarios...
```

```css
.header-ask {
  height: 40px;
  min-width: 320px;
  border-radius: var(--radius-pill);
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
}
```

### 9.6 Do Not

- Do not use a KPI slab.
- Do not use large stat cards at the top.
- Do not show irrelevant zero metrics.
- Do not make Forecasts feel like a dashboard before it feels like foresight.

---

## 10. Foresight Brief

### 10.1 Purpose

The Foresight Brief is the synthesis object for the page.

It answers:

> What futures are most likely to move soon?

### 10.2 Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ FORESIGHT BRIEF                                                       │
│                                                                      │
│ Engineering capacity and anchor-account reliability are the two       │
│ futures most likely to move this month.                              │
│                                                                      │
│ WHAT CHANGED               RESOLVES SOON        INTERVENTIONS         │
│ Beacon renewal risk up     Beacon renewal May17 Assign sync owner     │
│ Capacity 88% → 92%         Capacity >90% May21  Pause commitments     │
│ Pricing gap affects Q3     Pricing owner May24  Resolve ownership     │
│                                                                      │
│                                                   View all forecasts →│
└──────────────────────────────────────────────────────────────────────┘
```

### 10.3 Component Anatomy

```tsx
<ForesightBrief>
  <BriefStatement />
  <WhatChangedList />
  <ResolvesSoonList />
  <InterventionOpportunities />
  <ViewAllLink />
</ForesightBrief>
```

### 10.4 Brief Statement

Must be written as synthesis, not telemetry.

Good:

```text
Engineering capacity and anchor-account reliability are the two futures most likely to move this month.
```

Bad:

```text
4 patterns accelerating and 5 forecasts resolving.
```

### 10.5 What Changed List

Each item includes:
- trend icon
- short forecast movement
- optional before/after

Example:

```text
Beacon renewal risk increased
Engineering capacity forecast moved 88% → 92%
Pricing-owner gap is affecting Q3 delivery
```

### 10.6 Resolves Soon

Each row:
- forecast label
- resolution date

Example:

```text
Beacon renewal risk        May 17
Engineering capacity >90%  May 21
Pricing-owner decision     May 24
```

### 10.7 Intervention Opportunities

Each row:
- action/intervention label
- optional icon

Example:

```text
Assign sync escalation owner
Pause net-new platform commitments
Resolve pricing ownership
```

### 10.8 Styling

```css
.foresight-brief {
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  position: relative;
  overflow: hidden;
}

.foresight-brief::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--moss-cipher);
}

.foresight-brief-inner {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr 0.9fr 0.95fr;
  gap: 32px;
  padding: 28px 32px;
}
```

---

## 11. Mode Selector

### 11.1 Modes

```text
Horizon | Patterns | Scenarios | Accuracy
```

### 11.2 Default

`Horizon`

### 11.3 Styling

Use a restrained segmented control.

```css
.mode-tabs {
  display: inline-flex;
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-pill);
  background: var(--porcelain-mist);
  padding: 4px;
}

.mode-tab.active {
  background: var(--deep-forest);
  color: var(--porcelain-mist);
}
```

### 11.4 Behavior

Switching mode changes the page body, not the route unless URL state is needed.

Optional URL:

```text
/forecasts?mode=patterns
```

---

## 12. Forecast Horizon Matrix

### 12.1 Purpose

The Forecast Horizon Matrix is the main visual object in Horizon Mode.

It answers:

> Where is the future forming, and when will it matter?

### 12.2 Structure

Rows are domains.  
Columns are time horizons.

```text
                   Next 14 days     15–45 days      46–90 days

Customers & Revenue      cards          cards           cards
Commitments & Delivery   cards          cards           cards
Systems & Capacity       cards          cards           cards
People & Ownership       cards          cards           cards
Finance & Capital        cards          cards           cards
```

### 12.3 Recommended Domains

Required:

```text
Customers & Revenue
Commitments & Delivery
Systems & Capacity
People & Ownership
Finance & Capital
```

Optional:
```text
Product & Delivery
GTM & Pipeline
Security & Compliance
```

### 12.4 Time Horizons

Default:

```text
Next 14 days
15–45 days
46–90 days
```

### 12.5 Container Styling

```css
.forecast-horizon {
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-xl);
  padding: 22px 24px;
  box-shadow: var(--shadow-card);
}
```

### 12.6 Matrix Layout

```css
.horizon-grid {
  display: grid;
  grid-template-columns: 148px repeat(3, minmax(150px, 1fr));
  gap: 12px;
}
```

### 12.7 Visible Card Limits

To preserve clarity:

```text
Max visible cards per domain/horizon cell: 2
Max visible forecast cards in matrix: 18
```

If more forecasts exist:

```text
+3 more
View all 18 forecasts →
```

### 12.8 Selection

Clicking a card:
- selects it
- updates the Foresight Inspector
- highlights the card
- does not navigate away

---

## 13. Forecast Card

### 13.1 Purpose

A forecast card is a compact representation of one future claim.

### 13.2 Anatomy

```text
Beacon renewal risk likely to increase
78% ↑
resolves May 17
Driver: sync failures
tiny sparkline
```

### 13.3 Required Fields

```ts
type ForecastCard = {
  id: string;
  statement: string;
  domain: ForecastDomain;
  horizon: "next_14_days" | "days_15_45" | "days_46_90";
  confidence: number;
  confidenceDelta?: number;
  resolutionDate?: string;
  impact?: {
    label: string;
    value?: number;
    unit?: "ARR" | "commitments" | "customers" | "teams" | "other";
  };
  topDriver?: string;
  trend: "up" | "down" | "flat" | "volatile";
  severity?: "critical" | "high" | "medium" | "low" | "opportunity";
  interventionAvailable?: boolean;
  sparkline?: number[];
};
```

### 13.4 Styling

```css
.forecast-card {
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  min-height: 96px;
  cursor: pointer;
}

.forecast-card.selected {
  border-color: var(--deep-garnet);
  box-shadow: 0 0 0 1px rgba(127, 47, 41, 0.12);
}
```

### 13.5 Card Rules

Do not include:
- full evidence list
- long explanations
- action buttons
- complete related context

The card is for scanning. The inspector is for depth.

---

## 14. Foresight Inspector

### 14.1 Purpose

The Foresight Inspector explains one selected forecast.

It answers:

```text
What is the forecast?
Why did it move?
What patterns drive it?
What indicators are being watched?
What would change it?
What can we do?
```

### 14.2 Default Selection

Select the highest-impact near-term forecast by default.

If no near-term forecast exists, select:
1. highest-impact forecast
2. most changed forecast
3. highest-confidence forecast

### 14.3 Layout

```text
Selected Forecast

Beacon renewal risk likely to increase
Customers & Revenue · resolves May 17

Confidence movement
78% confidence · +13pp in 7 days
trajectory chart

Why this forecast
Renewal risk increases if Salesforce sync issues continue.

Driving patterns
- Anchor accounts reporting reliability issues
- Support backlog response time increasing
- Account-owner response gaps

Leading indicators
Sync failures        ↑ 42%
Renewal sentiment    Negative
Support tickets      ↑ 33%
Owner response time  2.4x

Would change if
✓ No new sync failures for 7 business days
✓ Account owner confirms reporting restored
✓ Renewal sentiment returns neutral or positive

Intervention levers
- Escalate sync owner
- Increase account touchpoints
- Create Proposed Change

Related context
Model: Customers & Revenue → Beacon
Today: Escalate customer risk
Ledger: 3 similar risks resolved
```

### 14.4 Styling

```css
.foresight-inspector {
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-focus);
  overflow: hidden;
}

.foresight-inspector[data-severity="critical"] {
  border-top: 3px solid var(--deep-garnet);
}

.foresight-inspector[data-severity="opportunity"] {
  border-top: 3px solid var(--antique-gold);
}
```

### 14.5 Inspector Sections

Required:
1. Selected forecast header
2. Confidence movement
3. Why this forecast
4. Driving patterns
5. Leading indicators
6. Would change if
7. Intervention levers
8. Related context
9. Ask Fyralis

---

## 15. Confidence Movement

### 15.1 Purpose

Show forecast probability over time.

Example:

```text
78% confidence
+13pp in 7 days
```

### 15.2 Visual

Use:
- small line chart
- prior value
- current value
- resolution date marker if available

### 15.3 Data Shape

```ts
type ConfidenceSeries = {
  points: {
    timestamp: string;
    confidence: number;
  }[];
  current: number;
  deltaWindowDays: number;
  delta: number;
};
```

### 15.4 Rules

- Do not imply false precision.
- Always pair probability with evidence and falsifiers.
- If confidence is low, state that clearly.

---

## 16. Why This Forecast

### 16.1 Purpose

Explain the forecast in plain English.

Good:
```text
Renewal risk increases if Salesforce sync issues continue.
Anchor accounts are raising reliability concerns.
```

Bad:
```text
Forecast probability increased due to multi-source pattern activation.
```

Copy must be understandable to a non-technical executive.

---

## 17. Driving Patterns

### 17.1 Purpose

Patterns explain recurring dynamics behind one or more forecasts.

Examples:

```text
Anchor accounts reporting reliability issues
Support backlog response time increasing
Account-owner response gaps on escalations
Engineering cycle time increasing
ICP scoring requests rising across enterprise
```

### 17.2 Pattern Row

```text
Pattern name
Strengthening / weakening / stable
Supports X forecasts
Source coverage
```

### 17.3 Visual

Use iris/lapis accents.

Patterns should feel like hidden structure emerging.

---

## 18. Leading Indicators

### 18.1 Purpose

Leading indicators are signals Fyralis is watching to update the forecast.

Examples:

```text
Sync failures
Renewal sentiment
Support tickets
Owner response time
Cycle time
Hiring progress
Product usage
CRM health drift
```

### 18.2 Indicator Row

```text
Sync failures
Last 7 days
↑ 42%
sparkline
```

### 18.3 Styling

- Lapis for evidence-like indicators
- Garnet for worsening risk indicators
- Moss for improving indicators
- Subtle sparklines, not heavy charts

---

## 19. Would Change If

### 19.1 Purpose

This is one of the most important trust-building sections.

Every meaningful forecast should specify what would make Fyralis revise it.

Example:

```text
Would change if

✓ No new sync failures for 7 business days
✓ Account owner confirms reporting restored
✓ Renewal sentiment returns to neutral or positive
```

### 19.2 Rules

Conditions must be:
- observable
- specific
- preferably time-bounded

Do not use vague language like:
```text
if things improve
```

### 19.3 UX Role

This section prevents the page from feeling like an oracle.

It tells the user:

> Fyralis knows what would make it change its mind.

---

## 20. Intervention Levers

### 20.1 Purpose

Intervention levers show what actions could alter the forecast.

Examples:

```text
Escalate sync owner
Increase account touchpoints
Create Proposed Change
Pause net-new platform commitments
Resolve pricing ownership
```

### 20.2 Actions

Each lever can expose:

```text
View Today item
Create Proposed Change
Open in Model
Ask Fyralis
```

### 20.3 Button Rules

- Show 2–3 top levers.
- Use one primary action max.
- Use text links for secondary actions.
- Do not make Forecasts feel like Today.

---

## 21. Related Context

### 21.1 Purpose

Connect Forecasts to Model, Today, and Ledger.

Example:

```text
Related context

Model:
Customers & Revenue → Beacon
Systems & Capacity → Salesforce Sync

Today:
Escalate customer risk

Ledger:
3 similar risks resolved
```

### 21.2 Navigation

- Model link opens relevant Model state.
- Today link opens Proposed Change review mode.
- Ledger link opens relevant event chain.

---

## 22. Ask Fyralis in Forecasts

### 22.1 Purpose

Ask Fyralis is for:
- scenario generation
- forecast explanation
- falsifier interrogation
- pattern exploration
- intervention comparison

### 22.2 Placement

Inside the Foresight Inspector, below forecast details.

### 22.3 Prompt Chips

Examples:

```text
Why did this increase?
What if we assign an owner today?
What is the downside if we wait 7 days?
Show similar past outcomes.
What would falsify this?
Which intervention has the most leverage?
```

### 22.4 Ask Input Placeholder

```text
Ask a question or request scenario...
```

### 22.5 Response Types

```ts
type ForecastAskResponse =
  | ForecastExplanation
  | ScenarioAnalysis
  | FalsifierExplanation
  | PatternTrace
  | InterventionComparison
  | AccuracyReference;
```

### 22.6 Scenario Response Example

```text
Scenario: Assign sync owner today

Expected effects:
- Owner-gap risk decreases
- Renewal-risk re-evaluation moves earlier
- Beacon risk may fall from 78% → 63% if confirmed within 48h

Confidence:
Moderate

Missing:
No recent Beacon call transcript.
```

Actions:
```text
Save scenario
Create Proposed Change
Open in Model
```

---

## 23. Pattern Field

### 23.1 Purpose

The Pattern Field shows recurring dynamics that support multiple forecasts.

This is one of Forecasts’ most differentiated sections.

### 23.2 Location

Below the Forecast Horizon Matrix.

### 23.3 Layout

```text
Pattern Field

[Pattern card] [Pattern card] [Pattern card] [Pattern card]

View all patterns →
```

### 23.4 Pattern Card Anatomy

```text
Anchor accounts reporting reliability issues
Strengthening
Supports 3 forecasts
Sources: Support · CRM · Email
```

### 23.5 Pattern Data Shape

```ts
type PatternCard = {
  id: string;
  title: string;
  status: "strengthening" | "weakening" | "stable" | "emerging";
  supportedForecastCount: number;
  sources: string[];
  relatedForecastIds: string[];
  confidence?: number;
  movement?: "up" | "down" | "flat";
};
```

### 23.6 Styling

```css
.pattern-card {
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-lg);
  padding: 16px;
}
```

Use:
- iris for patterns
- lapis for source grounding
- moss for strengthening positive patterns
- garnet only for material negative patterns

---

## 24. Patterns Mode

When user selects `Patterns` mode, Pattern Field becomes primary.

### Layout

```text
Patterns

4 strengthening · 2 emerging · 1 weakening

Pattern clusters
- Anchor reliability
- Engineering cycle time
- Owner gaps
- ICP scoring demand

Selected pattern inspector
- supporting forecasts
- evidence
- source coverage
- would confirm/falsify
```

### Pattern Inspector

Shows:

```text
Pattern name
Status
Supported forecasts
Source coverage
Evidence
What would confirm
What would weaken
Related Model context
Related Forecasts
```

---

## 25. Accuracy & Resolution Strip

### 25.1 Purpose

Forecasts must show whether Fyralis has been right.

This builds trust.

### 25.2 Placement

Bottom of Forecasts page.

### 25.3 Layout

```text
Accuracy & Resolution

71% calibrated accuracy
7 resolved true
2 resolved false
3 pending resolution
+4pp average calibration error

View accuracy detail →
```

### 25.4 Styling

```css
.accuracy-strip {
  background: var(--porcelain-mist);
  border: 1px solid var(--stone-veil);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
}
```

### 25.5 Data Shape

```ts
type ForecastAccuracySummary = {
  period: "last_30_days" | "last_90_days" | "all_time";
  calibratedAccuracy: number;
  resolvedTrue: number;
  resolvedFalse: number;
  pending: number;
  avgCalibrationErrorPp: number;
  trend: number[];
};
```

---

## 26. Accuracy Mode

Accuracy Mode shows:

```text
Resolved forecasts
Initial confidence
Outcome
Resolution date
Calibration impact
Related Ledger event
```

### Table Columns

```text
Forecast
Initial confidence
Final confidence
Outcome
Resolution date
Accuracy impact
Ledger link
```

### Rules

- Accuracy data must not be hidden.
- If there is not enough history, show a calibration-in-progress state.
- Link resolved forecasts to Ledger.

---

## 27. Scenario Mode

### 27.1 Purpose

Scenario Mode lets users ask “what if” questions.

### 27.2 Layout

```text
Scenarios

Ask Fyralis:
What if we assign VP Engineering today?

Scenario cards:
- Assign owner today
- Wait 7 days
- Pause commitments
- Increase account touchpoints
```

### 27.3 Scenario Card

```text
Scenario: Assign VP Engineering today

Expected effect
Beacon renewal risk 78% → 63% if confirmed in 48h

Tradeoffs
May increase Engineering Platform load

Missing
No recent Beacon call transcript

Actions
Create Proposed Change
Save scenario
Compare
```

### 27.4 Scenario Rules

- Scenarios are temporary unless saved.
- Scenarios must not silently mutate the model.
- Any model mutation must become a Proposed Change first.

---

## 28. Forecast Lifecycle

Forecasts have lifecycle states.

```text
emerging
active
resolving_soon
resolved_true
resolved_false
archived
```

### 28.1 Emerging

Forecast has weak but notable signal.

Visual:
- low emphasis
- partial confidence
- label: Emerging

### 28.2 Active

Forecast is part of the Forecast Horizon Matrix.

Visual:
- normal card treatment
- confidence and resolution date visible

### 28.3 Resolving Soon

Forecast resolution window is approaching.

Visual:
- small time emphasis
- may appear in Foresight Brief `Resolves Soon`

### 28.4 Resolved True

Forecast outcome occurred.

- move to Accuracy
- write Ledger event
- update calibration

### 28.5 Resolved False

Forecast did not occur.

- move to Accuracy
- write Ledger event
- update calibration

### 28.6 Archived

Historical only.

- accessible in Ledger and Accuracy
- not shown in active Forecast Horizon

---

## 29. Pattern Lifecycle

Patterns have lifecycle states.

```text
emerging
strengthening
stable
weakening
resolved
archived
```

### 29.1 Emerging

Pattern detected but not yet strong.

### 29.2 Strengthening

Pattern is increasing in evidence or impact.

### 29.3 Stable

Pattern is present but not accelerating.

### 29.4 Weakening

Pattern is losing support.

### 29.5 Resolved

Pattern no longer materially active.

### 29.6 Archived

Historical pattern.

---

## 30. Data Contracts

### 30.1 Initial Page Payload

```ts
type ForecastsPagePayload = {
  header: ForecastsHeaderData;
  foresightBrief: ForesightBriefData;
  horizon: ForecastHorizonData;
  selectedForecastId: string | null;
  forecastDetailsById: Record<string, ForecastDetail>;
  patterns: PatternCard[];
  accuracy: ForecastAccuracySummary;
  modes: ForecastModeState;
};

type ForecastsHeaderData = {
  activeForecastCount: number;
  resolvingSoonCount: number;
  acceleratingPatternCount: number;
  calibratedAccuracy?: number;
  horizonDays: number;
  lastUpdatedAt: string;
};

type ForesightBriefData = {
  statement: string;
  whatChanged: {
    id: string;
    label: string;
    direction?: "up" | "down" | "flat";
    severity?: "low" | "medium" | "high";
  }[];
  resolvesSoon: {
    forecastId: string;
    label: string;
    resolutionDate: string;
  }[];
  interventions: {
    id: string;
    label: string;
    relatedForecastId?: string;
    actionType?: "view_today" | "create_delta" | "open_model";
  }[];
};

type ForecastHorizonData = {
  domains: ForecastDomainRow[];
  horizons: ForecastHorizonColumn[];
};

type ForecastDomainRow = {
  id: string;
  label: string;
  icon?: string;
  cells: ForecastHorizonCell[];
};

type ForecastHorizonColumn = {
  id: "next_14_days" | "days_15_45" | "days_46_90";
  label: string;
  startDay: number;
  endDay: number;
};

type ForecastHorizonCell = {
  horizonId: string;
  forecasts: ForecastCard[];
  hiddenCount?: number;
};
```

### 30.2 Forecast Detail

```ts
type ForecastDetail = {
  id: string;
  statement: string;
  domain: string;
  severity: "critical" | "high" | "medium" | "low" | "opportunity";
  confidence: number;
  confidenceDelta?: number;
  confidenceSeries: ConfidenceSeries;
  resolutionDate?: string;
  resolutionWindow?: {
    start: string;
    end: string;
  };
  whyThisForecast: string;
  drivingPatterns: DrivingPattern[];
  leadingIndicators: LeadingIndicator[];
  wouldChangeIf: Falsifier[];
  interventionLevers: InterventionLever[];
  relatedContext: RelatedContext;
  evidenceSummary?: EvidenceSummary;
};

type DrivingPattern = {
  id: string;
  title: string;
  status: "strengthening" | "weakening" | "stable" | "emerging";
  supportedForecastCount: number;
  sourceCoverage?: string[];
};

type LeadingIndicator = {
  id: string;
  label: string;
  valueLabel: string;
  direction: "up" | "down" | "flat";
  severity?: "positive" | "neutral" | "negative";
  timeframe?: string;
  sparkline?: number[];
};

type Falsifier = {
  id: string;
  text: string;
  observable: boolean;
  timeframe?: string;
  status?: "unmet" | "partially_met" | "met";
};

type InterventionLever = {
  id: string;
  label: string;
  expectedEffect?: string;
  actionType: "view_today" | "create_proposed_change" | "open_model" | "ask";
  relatedObjectId?: string;
};

type RelatedContext = {
  modelLinks: {
    label: string;
    href: string;
  }[];
  todayLinks: {
    label: string;
    proposedChangeId: string;
  }[];
  ledgerLinks: {
    label: string;
    eventId: string;
  }[];
};

type EvidenceSummary = {
  signalCount: number;
  quality: "weak" | "partial" | "moderate" | "strong";
  sources: {
    label: string;
    strength: "weak" | "partial" | "moderate" | "strong";
    count?: number;
  }[];
};
```

### 30.3 Ask Payload

```ts
type ForecastAskRequest = {
  page: "forecasts";
  mode: "horizon" | "patterns" | "scenarios" | "accuracy";
  selectedForecastId?: string;
  selectedPatternId?: string;
  prompt: string;
  visibleForecastIds: string[];
  horizonDays: number;
};

type ForecastAskResponse = {
  type:
    | "forecast_explanation"
    | "scenario_analysis"
    | "falsifier_explanation"
    | "pattern_trace"
    | "intervention_comparison"
    | "accuracy_reference";
  title: string;
  body: string;
  evidenceUsed?: string[];
  missingContext?: string[];
  actions?: {
    label: string;
    type: "create_proposed_change" | "open_model" | "open_today" | "save_scenario";
    payload?: unknown;
  }[];
};
```

---

## 31. Page State Machine

### 31.1 States

```text
loading
empty
horizon_default
forecast_selected
patterns_mode
scenario_mode
accuracy_mode
ask_response
error
```

### 31.2 Initial State

If active forecasts exist:

```text
horizon_default
```

Select forecast by:

1. highest-impact near-term forecast
2. most changed forecast
3. highest-confidence forecast

### 31.3 Empty State

If no active forecasts:

```text
No active forecasts right now.

Fyralis is still monitoring leading indicators.
3 patterns are being watched.

[Open Model] [View Ledger] [Ask Fyralis]
```

### 31.4 Loading State

Skeletons for:
- header stats
- Foresight Brief
- Forecast Horizon Matrix
- Inspector
- Pattern Field
- Accuracy Strip

### 31.5 Error State

```text
Forecasts could not be loaded.

[Try again] [Open Model]
```

---

## 32. Interactions

### 32.1 Select Forecast Card

On click:

- selected card gets selected state
- Foresight Inspector updates
- optional URL query updates

```text
/forecasts?forecast=<id>
```

No route transition.

### 32.2 Change Horizon

Controls:

```text
Next 14 days
15–45 days
46–90 days
```

Can filter visible matrix or scroll to relevant columns.

### 32.3 Switch Mode

Mode tabs:

```text
Horizon
Patterns
Scenarios
Accuracy
```

Mode switch updates body content.

Optional URL:

```text
/forecasts?mode=patterns
```

### 32.4 Create Proposed Change

Triggered from intervention lever.

Flow:
1. Open Proposed Change preview.
2. Show Current → Proposed.
3. User confirms.
4. Add to Today.
5. Link forecast to Today item.

### 32.5 Open in Model

Navigates to relevant Model state.

Example:

```text
/model?focus=customers_revenue&item=beacon
```

### 32.6 Open Today Item

Navigates to Today review mode.

Example:

```text
/today?review=<proposedChangeId>
```

### 32.7 Open Ledger Context

Navigates to Ledger event chain.

Example:

```text
/ledger?event=<eventId>
```

---

## 33. Responsive Behavior

### 33.1 Wide Desktop

Use full layout:

```text
Sidebar + Forecast Horizon + Inspector
Pattern Field below
Accuracy Strip bottom
```

### 33.2 Medium Desktop

If width < 1280px:

- inspector stacks below Forecast Horizon
- matrix remains full width
- reduce visible cards per cell

### 33.3 Tablet

- sidebar collapses
- header controls wrap
- horizon matrix becomes vertical domain sections
- inspector becomes accordion below selected forecast

### 33.4 Mobile

- single column
- Foresight Brief first
- horizon selector as segmented control
- forecast cards in vertical list grouped by horizon
- inspector opens as in-page expanded card
- Ask Fyralis remains contextual

---

## 34. Accessibility

- Forecast cards are keyboard-selectable.
- Forecast cards have accessible labels.
- Probability changes must be text, not color only.
- Sparklines must have aria labels or hidden text.
- Mode selector uses tab semantics.
- Falsifier checkmarks must have text labels.
- Ask input is keyboard accessible.
- Pattern statuses are text-labeled.
- Motion respects `prefers-reduced-motion`.
- Focus should move to inspector heading when a forecast is selected by keyboard.

---

## 35. QA Checklist

### Structure

- [ ] Forecasts does not look like Today or Model.
- [ ] Forecast Horizon Matrix is the primary surface.
- [ ] Foresight Brief appears above the horizon.
- [ ] Selected forecast inspector is visible by default.
- [ ] Pattern Field appears below matrix.
- [ ] Accuracy Strip appears at bottom.

### Product Value

- [ ] Page answers what is forming.
- [ ] Forecast cards show time horizon and resolution.
- [ ] Forecast detail includes driving patterns.
- [ ] Forecast detail includes leading indicators.
- [ ] Forecast detail includes “Would change if.”
- [ ] Forecast detail includes intervention levers.
- [ ] Accuracy is visible somewhere on the page.

### Visual

- [ ] Warm luminous canvas.
- [ ] Dark forest sidebar.
- [ ] Iris/lapis used for uncertainty/evidence.
- [ ] Garnet reserved for material risk.
- [ ] No large KPI slab.
- [ ] No generic analytics-console overload.

### Interactions

- [ ] Selecting forecast updates inspector.
- [ ] Ask Fyralis responds with context.
- [ ] Create Proposed Change links to Today.
- [ ] Open in Model links to current-state context.
- [ ] Accuracy detail links to Ledger.
- [ ] Horizon mode is default.

### Trust

- [ ] Every selected forecast has a falsifier or “Would change if” condition.
- [ ] Forecast confidence has visible movement context.
- [ ] Forecasts with weak evidence show weak evidence.
- [ ] First-time/calibrating states avoid over-authority.

---

## 36. Implementation Phases

### Phase 1 — Core Page

- Header
- Foresight Brief
- Forecast Horizon Matrix
- Forecast Cards
- Foresight Inspector

### Phase 2 — Trust and Depth

- Driving patterns
- Leading indicators
- Would change if
- Intervention levers
- Related context links

### Phase 3 — Pattern Field and Accuracy

- Pattern Field cards
- Accuracy & Resolution strip
- Accuracy mode

### Phase 4 — Ask and Scenarios

- Contextual Ask Fyralis
- Scenario mode
- Scenario responses
- Create Proposed Change flow

### Phase 5 — Polish

- Motion
- responsive states
- keyboard navigation
- accessibility
- visual refinement

---

## 37. Final Experience Goal

The final Forecasts page should feel like:

> Fyralis is showing the user the futures beginning to take shape, the patterns driving them, the signals that will confirm or falsify them, and the interventions that could change them.

This page gives the product a new dimension of value.

Today asks:

```text
What needs judgment now?
```

Model asks:

```text
What is currently true and connected?
```

Forecasts asks:

```text
What is forming, and what can change it?
```

That is the page.
