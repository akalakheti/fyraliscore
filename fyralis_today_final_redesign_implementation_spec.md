
# Fyralis Today Page — Final Redesign Implementation Specification

**Document purpose:**  
This document defines the final design and implementation requirements for the Fyralis **Today** page after the latest product, visual, and interaction revisions.

A developer should be able to implement the Today page from this document without needing to infer product behavior, layout hierarchy, interaction states, or component intent.

---

## 0. Executive Summary

The Today page is the first page a user sees. It must not feel like a task board, approval queue, or dashboard. It must feel like Fyralis has been working on behalf of the user and has distilled company complexity into the few things that need human judgment.

The final Today page has two primary modes:

1. **Briefing Mode**  
   The user lands on Today and receives a calm re-entry brief:
   - what Fyralis reviewed
   - what it absorbed
   - what changed
   - what needs judgment
   - where to start

2. **Review Mode**  
   When the user selects a Proposed Change, the page enters an in-page focused review state:
   - the global sidebar collapses to an icon rail
   - a soft local review queue appears
   - the selected Proposed Change becomes a large focused review sheet
   - the user can move through items quickly without leaving Today

The user should always feel:

> “I am still in Today. Fyralis has reduced the noise. I am now reviewing one judgment with full context.”

---

## 1. Product Role of Today

### 1.1 Core Question

Today answers:

> **What needs my judgment right now?**

It does not answer:

- “What is currently true across the company?” → Model
- “What is forming or likely to happen?” → Forecasts
- “What happened and how did it resolve?” → Ledger

### 1.2 Product Value

Today provides:

1. **Attention protection**  
   Fyralis processed many signals and only surfaced the few that require judgment.

2. **Executive re-entry**  
   The user can return to the company and understand what matters since their last session.

3. **Safe authority**  
   Every Proposed Change shows what will change, why, what evidence supports it, what may be missing, and what happens if accepted.

4. **Fast review flow**  
   Users can move through judgment items without page navigation or modal interruption.

5. **Trust and correction**  
   Fyralis must visibly support evidence review, missing context, correction, and delegation.

---

## 2. Core User-Facing Object: Proposed Change

The internal concept may be **Decision Delta**, but user-facing language should be:

> **Proposed Change**

A Proposed Change is a reviewable model mutation requiring the user's judgment.

### 2.1 Definition

A Proposed Change is:

> A proposed change to the company model that Fyralis believes requires human authority, delegation, review, or correction.

### 2.2 Proposed Change Must Answer

Every expanded Proposed Change must answer:

1. What is being proposed?
2. What changes if accepted?
3. Why does this matter?
4. What evidence supports it?
5. What may be missing?
6. What happens if accepted?
7. What can the user do next?

### 2.3 Data Shape

```ts
type ProposedChange = {
  id: string;

  title: string;
  subtitle?: string;

  status:
    | "needs_authority"
    | "needs_review"
    | "delegatable"
    | "monitoring"
    | "contested"
    | "accepted"
    | "delegated"
    | "corrected"
    | "dismissed";

  priority: "critical" | "high" | "medium" | "low";

  sourceCategory?: string; // e.g. "Risks & Constraints"
  relatedCategories: string[]; // e.g. ["Customers & Revenue", "Commitments"]

  createdAt: string;
  updatedAt?: string;

  proposedBy: "fyralis" | "user" | "system";
  targetActor?: {
    id: string;
    name: string;
    role?: string;
  };

  confidence?: {
    value: number; // 0-1
    label: "low" | "moderate" | "high";
    explanation?: string;
  };

  currentState: ProposedChangeState[];
  proposedState: ProposedChangeState[];

  whyThisMatters: string;

  evidence: EvidenceSummary;

  missingContext: MissingContextItem[];

  impactIfAccepted: AcceptedImpactItem[];

  askSuggestions: AskSuggestion[];

  actions: ProposedChangeAction[];

  relatedModelItems?: RelatedModelItem[];

  lifecycle?: {
    acceptedAt?: string;
    delegatedAt?: string;
    resolvedAt?: string;
    nextEvaluationAt?: string;
  };
};

type ProposedChangeState = {
  label: string;       // e.g. "Risk level"
  current?: string;    // e.g. "Watch"
  proposed?: string;   // e.g. "Critical"
  actor?: {
    name: string;
    avatarUrl?: string;
  };
  emphasis?: "neutral" | "positive" | "warning" | "critical";
};

type EvidenceSummary = {
  signalCount: number;
  quality: "weak" | "partial" | "moderate" | "strong";
  rows: {
    label: string;     // e.g. "Support tickets"
    strength: "weak" | "partial" | "moderate" | "strong";
    count?: number;
    sourceType?: string;
  }[];
  note?: string;
};

type MissingContextItem = {
  text: string;
  severity?: "low" | "medium" | "high";
};

type AcceptedImpactItem = {
  text: string;
  type?: "model_update" | "notification" | "linkage" | "reevaluation" | "ledger";
};

type AskSuggestion = {
  label: string; // e.g. "Why now?"
  prompt: string;
};

type ProposedChangeAction = {
  type:
    | "accept"
    | "delegate"
    | "review_evidence"
    | "report_correction"
    | "request_changes"
    | "open_model";
  label: string;
  primary?: boolean;
};

type RelatedModelItem = {
  id: string;
  label: string;
  category: string;
  relationship: string;
};
```

---

## 3. Page Modes

The Today page has two primary modes and several secondary overlay states.

```text
Briefing Mode
  ↓ select Proposed Change
Review Mode
  ↓ accept/delegate/correct/review evidence/ask
Action Substates
```

---

# 4. Mode 1 — Briefing Mode

Briefing Mode is the default landing state.

## 4.1 Purpose

Briefing Mode communicates:

> “Fyralis reviewed the company. Most of the noise was absorbed. A few things need your judgment. Start here.”

## 4.2 Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Global Sidebar                                               │
├──────────────────────────────────────────────────────────────┤
│ Today Header                                                 │
│ Briefing sentence                                            │
│ Attention receipt                                            │
├──────────────────────────────────────────────────────────────┤
│ Fyralis Brief                                                │
│ What changed · Handled without you                           │
├──────────────────────────────────────────────────────────────┤
│ Primary Judgment Preview                                     │
├──────────────────────────────────────────────────────────────┤
│ Other Items Needing Judgment                                 │
├──────────────────────────────────────────────────────────────┤
│ Handled Without You Summary                                  │
└──────────────────────────────────────────────────────────────┘
```

## 4.3 Global Sidebar in Briefing Mode

In Briefing Mode, the global sidebar is expanded.

### Width

```css
--sidebar-expanded-width: 260px;
```

### Contents

- Fyralis logo
- Primary navigation:
  - Today
  - Model
  - Forecasts
  - Ledger
- Shortcuts:
  - Commitments
  - Customers
  - Risks
  - Decisions
  - Owners
  - Teams
- Utilities:
  - Ask Fyralis
  - Sources
  - Settings
- Model Live status card
- User profile card

### Active State

Today is active.

The active item should use:

- deep green background
- subtle left accent line
- icon + label
- no excessive glow

---

## 4.4 Today Header

### Required Copy

```text
Today

Fyralis reviewed the company since your last session.
98 signals processed · 91 absorbed · 7 need your judgment.

May 18, 12:03 PM
```

### Important Rule

Do **not** use a large metric tile bar at the top.

The previous segmented metric bar should be removed because it feels generic and repetitive.

### Header Content

Header should include:

- Page title: `Today`
- Briefing sentence
- Attention receipt
- Timestamp
- Optional:
  - `View change log →`
  - `Ask Fyralis`
  - Filters button

### Attention Receipt

Display as a sentence, not as tiles.

```text
98 signals processed · 91 absorbed · 7 need your judgment
```

Visual treatment:

- inline text
- key numbers bold
- “absorbed” in restrained moss/green
- “need your judgment” in restrained red/garnet
- no big cards
- no empty values
- no “— exposure” placeholder

---

## 4.5 Fyralis Brief

The Fyralis Brief is the emotional and informational anchor of the landing state.

### Purpose

It tells the user what Fyralis understood at a higher level before asking for action.

### Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Fyralis Brief                                                │
│                                                              │
│ Customer reliability and pricing ownership are the only       │
│ areas requiring your attention.                              │
│                                                              │
│ What changed                  Handled without you             │
│ - Beacon renewal risk up       - 91 signals absorbed          │
│ - Salesforce sync ongoing      - 12 model updates applied     │
│ - Engineering capacity improved- 5 items under monitoring     │
└──────────────────────────────────────────────────────────────┘
```

### Required Sections

1. **Brief statement**
   - One sentence of synthesis.
   - Must be human-readable.
   - Must not sound like system telemetry.

2. **What changed**
   - 3–5 bullet changes.
   - Each bullet should be short.
   - Can include direction icon: up/down/neutral.

3. **Handled without you**
   - signals absorbed
   - model updates applied
   - items under monitoring
   - no-action items

4. **Activity link**
   - `See all activity →`

### Visual Styling

- Warm paper surface
- Thin left accent line in restrained green
- No heavy border
- Low contrast section dividers
- Sparse icons
- Generous interior padding

### Example Copy

```text
Customer reliability and pricing ownership are the only areas requiring your attention.
```

---

## 4.6 Primary Judgment Preview

This is the first Proposed Change users should consider.

### Purpose

It answers:

> “Where should I start?”

### Layout

The primary judgment preview is not the full expanded review. It is a rich preview with one clear call to review.

```text
PRIMARY JUDGMENT        1 of 7

Escalate customer risk for Salesforce sync instability

At watch → Critical
78% confidence

Why it's important:
Three anchor customers are experiencing recurring sync failures...

Current → Proposed summary

What happens if accepted:
Create escalation · Notify VP Engineering · Link 3 renewal commitments

[Review this first →]
```

### Required Elements

- Label: `Primary Judgment`
- Count: `1 of 7`
- Proposed Change title
- current → proposed summary
- confidence or evidence quality
- one-sentence “Why it’s important”
- compact impact preview
- CTA: `Review this first →`

### Important

This preview should be visually prominent but not full review mode.

It is the bridge from Briefing Mode to Review Mode.

---

## 4.7 Other Items Needing Judgment

### Purpose

A compact list of remaining judgment items.

### Layout

```text
Other items needing your judgment  6

Assign owner for pricing model decision
Decision unassigned · Blocking 2 commitments
72% confidence · Due in 5 days

Clarify Q3 scope trade-off
Product & Engineering misaligned · Risk of commitment slip
65% confidence · Due in 7 days
```

### Row Contents

Each row includes:

- icon or status dot
- title
- one-line reason
- confidence / due / status
- chevron
- optional status chip

### Rules

- Rows must remain compact.
- Do not show full evidence.
- Do not show full action buttons.
- Clicking a row enters Review Mode for that item.

---

## 4.8 Handled Without You

### Purpose

Show Fyralis reduced the user’s burden.

### Required Items

Examples:

```text
91 signals absorbed
12 model updates applied
5 items under monitoring
All quiet / no new exposures
```

### Visual Treatment

Can appear as:

- one bottom card
- four compact summary cells
- a calm “receipt” panel

### Copy

```text
Fyralis handled 91 signals without needing you.
12 model updates were applied.
5 items are under monitoring.
```

### Important

This section is not filler. It reinforces delegated intelligence.

---

# 5. Mode 2 — Review Mode

Review Mode activates when the user selects a Proposed Change.

## 5.1 Purpose

Review Mode lets the user give one Proposed Change their full attention while preserving the Today flow.

The user should feel:

> “I am reviewing one important judgment, but I have not left Today.”

## 5.2 Key Structural Decision

Do not open:

- a new page
- a modal
- a separate route that feels like navigation
- a right-side inspector beside the queue

Instead, use:

> **In-page focused review with adaptive sidebar and local review rail.**

---

# 6. Review Mode Layout

```text
┌──────┬──────────────────┬────────────────────────────────────┐
│ Icon │ Review Queue     │ Focused Review Sheet               │
│ Rail │ Local index      │ Proposed Change detail             │
└──────┴──────────────────┴────────────────────────────────────┘
```

## 6.1 Global Sidebar Changes in Review Mode

When Review Mode is active, the global sidebar collapses to an icon-only rail.

### Collapsed Width

```css
--sidebar-collapsed-width: 72px;
```

### Visible Contents

- Fyralis logo mark
- Today icon active
- Model icon
- Forecasts icon
- Ledger icon
- Ask icon
- Model live dot
- user avatar

### Hidden Contents

- nav labels
- shortcuts
- utility labels
- model live full card
- full user profile card

### Why

This prevents two competing sidebars:

```text
Global nav sidebar + Review queue rail
```

from visually overwhelming the user.

---

## 6.2 Hover Expansion Behavior

The collapsed global sidebar expands on hover/focus.

### Expanded Width

```css
--sidebar-expanded-width: 260px;
```

### Behavior Rules

- Expansion overlays content.
- It does not push/reflow layout.
- It uses a shadow and z-index above the page.
- Add hover delay to prevent accidental expansion.

```css
--sidebar-hover-delay: 180ms;
--sidebar-collapse-delay: 300ms;
```

### Pin Option

Optional control:

```text
Pin sidebar
```

If pinned, sidebar remains expanded even in Review Mode.

### Accessibility

- Keyboard focus should also expand it.
- Escape should collapse it if not pinned.
- Screen reader labels must remain available even when visually collapsed.

---

# 7. Local Review Queue Rail

## 7.1 Purpose

The review rail is a local index for judgment items.

It is not global navigation.

It lets users move quickly through items while keeping one large review sheet in focus.

## 7.2 Width

```css
--review-rail-width: 280px; /* allowable range 260–320px */
```

## 7.3 Visual Style

The review rail should be visually quieter than the global sidebar.

Use:

- warm paper surface
- soft border-right
- no dark fill
- no dramatic forest background
- low-contrast card rows
- compact item rows

```css
.review-rail {
  width: 280px;
  background: var(--surface-paper);
  border-right: 1px solid var(--border-subtle);
}
```

## 7.4 Content

```text
Reviewing 1 of 7

Primary judgment
Escalate customer risk
Needs authority

Other items needing your judgment
Assign owner for pricing decision
Clarify Q3 scope trade-off
Approve packaging proposal

Handled without you
91 absorbed
12 updates
5 monitoring
```

## 7.5 Row Anatomy

Each review rail row includes:

- title
- one-line state
- small confidence / due / status
- selected indicator if active

### Example

```text
Assign owner for pricing model decision
Unassigned · 72% confidence · Due in 5 days
```

## 7.6 What Not to Include

Do not include:

- evidence icons
- full metadata chips
- action buttons
- long descriptions
- large icons
- card-heavy visual treatment

The rail is for switching, not deciding.

---

# 8. Focused Review Sheet

The focused review sheet is the primary surface in Review Mode.

## 8.1 Purpose

It presents one Proposed Change as a structured review case.

The user should understand:

- what is proposed
- what changes
- why it matters
- what evidence supports it
- what may be missing
- what happens if accepted
- how to act

## 8.2 Layout

```text
Reviewing 1 of 7                      Collapse review

PROPOSED CHANGE                       Needs your authority

Escalate customer risk for Salesforce sync instability

From Risks & Constraints · Proposed by Fyralis · Created 21m ago · Moderate confidence

Current vs. Proposed

Why this matters
Evidence
What may be missing
Impact if accepted

Ask Fyralis about this change

Actions
```

## 8.3 Dimensions

```css
.focused-review-sheet {
  max-width: 980px;
  min-height: 760px;
  margin: 0 auto;
  padding: 40px 44px 28px;
  border-radius: 18px;
  background: var(--surface-review);
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 24px 80px rgba(20, 28, 24, 0.08),
    0 2px 8px rgba(20, 28, 24, 0.05);
}
```

---

# 9. Focused Review Sheet Sections

## 9.1 Review Header

### Required Elements

- `Reviewing X of Y`
- previous / next controls
- collapse review button
- status chip

### Example

```text
Reviewing 1 of 7       [‹] [›]                    Collapse review
Needs your authority
```

### Previous / Next Controls

- Move to previous/next Proposed Change.
- Should not leave Review Mode.
- Should update URL query if using review ID.

---

## 9.2 Title Area

### Structure

```text
Proposed change

Escalate customer risk for Salesforce sync instability

From Risks & Constraints · Proposed by Fyralis · Created 21m ago · Moderate confidence
```

### Typography

- Label: small, restrained, sentence case preferred
- Title: editorial serif or high-quality display font
- Metadata: small sans-serif, muted

### Title Rules

Avoid raw machine phrasing when possible.

Bad:

```text
Tilt ($90K) showing 30-day usage drift — churn risk
```

Better:

```text
Escalate churn risk for Tilt
30-day usage drift is increasing renewal risk.
```

---

## 9.3 Current vs Proposed Diff

### Purpose

This is the core authorization object.

It must be visually prominent and easy to understand.

### Layout

Use a refined side-by-side comparison, not a generic table.

```text
Current                         Proposed

Risk level: Watch          →     Risk level: Critical
Owner: Unassigned          →     Owner: VP Engineering
Re-evaluate: 7 days        →     Re-evaluate: 48 hours
Notify: —                  →     VP Engineering + account owners
```

### Visual Rules

- Current and Proposed should be two clear panels.
- Changed values should be emphasized.
- Arrows should be minimal.
- Use semantic color sparingly:
  - Current neutral/warning
  - Proposed critical if appropriate
- Do not label the field as “Current.” Use meaningful field names.

### Data Requirements

Each diff row must include:

```ts
{
  label: string;
  current: string;
  proposed: string;
  emphasis?: "neutral" | "warning" | "critical" | "positive";
}
```

---

## 9.4 Why This Matters

### Purpose

Explain consequence, not restate the title.

### Good Example

```text
Three anchor customers are reporting recurring Salesforce sync failures.
Renewal exposure is increasing as confidence in sync reliability declines.
```

### Bad Example

```text
Salesforce sync instability is now threatening 3 anchor renewals.
```

If that repeats the title, it is not enough.

### Required Content

Must answer at least two:

- Why now?
- What is blocked?
- What is exposed?
- What happens if ignored?
- Why does this require human judgment?

---

## 9.5 Evidence

### Purpose

Build trust without overwhelming the user.

### Layout

```text
Evidence

12 signals

Support tickets       Strong
CRM logs              Strong
Email & threads       Partial

Review all evidence →
```

### Rules

- Do not display “0 signals” without explanation.
- If no new signals exist, say:

```text
No new signals since the last evaluation.
This proposed change is grounded in existing model items.
```

- Evidence must clarify source quality.

### Evidence States

```text
Strong
Moderate
Partial
Weak
Missing
```

---

## 9.6 What May Be Missing

### Purpose

Show humility and invite correction.

### Example

```text
What may be missing

- No recent Beacon call transcript
- Account owner has not confirmed severity
- Product usage trend is not connected
```

### Rules

- Always show if non-empty.
- If empty, use:

```text
No major context gaps identified.
```

But do not overstate certainty.

---

## 9.7 Impact If Accepted

### Purpose

Show concrete model and operational consequences.

### Example

```text
If accepted

+ Create escalation in Risks & Constraints
+ Notify VP Engineering and account owners
+ Link 3 renewal commitments
+ Schedule re-evaluation in 48h
```

### Rules

- Use operational language.
- Do not lead with system/audit internals.
- “Record ledger event” should not be a primary visible benefit.

Better:

```text
Fyralis will record this in Ledger.
```

as small tertiary text if needed.

---

# 10. Ask Fyralis Integration

Ask Fyralis must be treated as a first-class review primitive, not a generic chat box.

## 10.1 Placement

In the focused review sheet, Ask appears after:

- Current vs Proposed
- Why this matters
- Evidence
- Missing context
- Impact if accepted

and before or slightly above actions.

## 10.2 Visual Structure

```text
Ask Fyralis about this change

[Why now?] [What if I wait?] [Who should own this?] [What evidence is weakest?]

Ask a question or request...
```

## 10.3 Suggested Prompts

Must be generated contextually.

Examples:

```text
Why now?
What if I wait?
Who should own this?
What evidence is weakest?
What happens if we escalate?
What would make this wrong?
```

## 10.4 Ask Response Types

Ask should return typed product responses, not generic chat bubbles.

Supported response types:

```ts
type AskResponse =
  | ExplanationResponse
  | EvidenceResponse
  | OwnershipResponse
  | ScenarioResponse
  | ActionDraftResponse
  | CorrectionPromptResponse;
```

### Explanation Response

Example:

```text
Why now?

This surfaced because the sync issue has appeared across three anchor accounts,
and renewal exposure increased after the latest CRM update.
```

### Scenario Response

Example:

```text
If you wait 7 days:

- Renewal risk remains elevated
- The related commitment remains blocked
- Fyralis will re-evaluate if no new failures appear
```

### Ownership Response

Example:

```text
Recommended owner: VP Engineering

Why:
- Owns CRM reliability commitment
- Controls Salesforce sync stabilization
- Already connected to 2 affected commitments
```

### Action Draft Response

Example:

```text
Draft delegation

Delegate to VP Engineering
Message: Please own sync stabilization and confirm mitigation plan within 48h.

[Send delegation] [Edit] [Cancel]
```

## 10.5 Ask Must Respect Context

Ask receives:

```ts
type AskContext = {
  page: "today";
  mode: "briefing" | "review";
  selectedProposedChangeId?: string;
  visibleProposedChangeIds: string[];
  userRole: string;
  lastReviewTime?: string;
};
```

Short prompts like “Why now?” must refer to the selected Proposed Change.

## 10.6 Ask Should Not Navigate Away

Ask responses appear inline in the review sheet.

If Ask needs to transform another page, provide an action:

```text
Open in Model
Create proposed change
Review evidence
```

---

# 11. Action Bar

## 11.1 Location

The action bar is fixed to the bottom of the focused review sheet, not the browser viewport.

It should remain visible while reviewing.

## 11.2 Actions

Default actions:

```text
Accept change
Delegate
Review evidence
Report correction
```

### Primary Action

`Accept change`

- Strongest visual treatment
- Deep forest or appropriate status color
- Do not use bright red for the button unless absolutely necessary
- The risk can be red; the action should feel controlled and safe

### Secondary Actions

- Delegate
- Review evidence
- Report correction

### Tertiary / Overflow

- Request changes
- Snooze
- Mark known
- Open in Model

---

# 12. Action Flows

## 12.1 Accept Change

On click:

1. Disable action buttons.
2. Show applying state.
3. Apply model mutation.
4. Show confirmation state inside the sheet.
5. Move item to Monitoring / Handled depending on status.
6. Update review rail counts.

### Confirmation Example

```text
Change accepted

Fyralis created the escalation, notified VP Engineering,
linked 3 renewal commitments, and scheduled re-evaluation in 48h.

Moved to Monitoring.
```

Do not make the item vanish instantly.

## 12.2 Delegate

Open inline delegation sheet or small drawer.

Fields:

```text
Delegate to
Due date
Message
Notify now
```

After delegation:

```text
Delegated to VP Engineering.
Fyralis will monitor for confirmation.
```

## 12.3 Review Evidence

Open an evidence drawer within Review Mode.

Evidence drawer includes:

- source
- timestamp
- trust tier
- excerpt / summary
- relationship to proposed change

## 12.4 Report Correction

Open correction form.

Options:

```text
This is wrong
Missing context
Wrong owner
Already handled
Not important
Other
```

After correction:

```text
Correction recorded.
Fyralis will re-evaluate this proposed change.
```

---

# 13. Transitions

## 13.1 Enter Review Mode

Triggered by:

- clicking `Review this first`
- clicking any Proposed Change in Briefing Mode
- direct URL query: `/today?review=<id>`

Transition:

1. Global sidebar collapses to icon rail.
2. Review rail appears.
3. Selected item becomes focused review sheet.
4. Page scrolls to review surface if needed.
5. Focus moves to review sheet heading.

Timing:

```css
--transition-fast: 180ms;
--transition-standard: 280ms;
--transition-slow: 420ms;
```

Use:

```css
ease-out
```

No bounce. No theatrical motion.

## 13.2 Collapse Review

Triggered by:

- `Collapse review`
- Escape key
- removing `review` query param

Transition:

1. Focused review sheet collapses.
2. Review rail disappears.
3. Global sidebar expands back to full width unless user has pinned collapsed mode.
4. User returns to Briefing Mode.

## 13.3 Switch Review Item

Triggered by:

- clicking another item in review rail
- next/previous controls
- keyboard shortcuts

Behavior:

- Do not leave Review Mode.
- Replace selected Proposed Change content.
- Preserve scroll position inside the review sheet unless inappropriate.
- Focus updates to new title.

## 13.4 Accepted / Delegated / Corrected Item

After successful action:

- show confirmation state
- update row status
- move item to relevant group after short delay or on user command
- keep user in Review Mode if other items remain

---

# 14. Keyboard Shortcuts

Recommended:

```text
J / ArrowDown     Next item
K / ArrowUp       Previous item
Enter             Expand/select item
Esc               Collapse review
A                 Accept change
D                 Delegate
E                 Review evidence
R                 Report correction
⌘K / CtrlK        Ask Fyralis
```

All shortcuts must be discoverable in a help menu.

Do not trigger destructive actions without confirmation if focus is inside input fields.

---

# 15. URL and Routing

Use one page route:

```text
/today
```

Review state may be represented with query params:

```text
/today?review=delta_123
```

Do not create a route that visually feels like a separate page.

Direct load with query param should open Review Mode for that item.

Browser back should return to Briefing Mode if the review query was added by user interaction.

---

# 16. Visual Design Tokens

## 16.1 Color Tokens

Use final brand palette direction.

```css
:root {
  --color-deep-forest: #071713;
  --color-forest-shadow: #132623;

  --color-paper: #F7F2EA;
  --color-surface: #FFFCF6;
  --color-surface-review: #FFFDF7;

  --color-border: #DDD7CB;
  --color-border-soft: rgba(24, 32, 28, 0.12);

  --color-text: #18201C;
  --color-text-muted: #768177;

  --color-moss: #3E6A57;
  --color-living-moss: #4F8A6A;

  --color-gold: #C9A35A;
  --color-coral: #C96A56;
  --color-garnet: #7F2F29;

  --color-lapis: #315A7A;
  --color-iris: #6D678B;
}
```

## 16.2 Typography

Suggested roles:

```css
--font-display: serif;
--font-body: sans-serif;
```

### Page title

```css
font-size: 42px;
line-height: 1.1;
letter-spacing: -0.02em;
```

### Review title

```css
font-size: 34px;
line-height: 1.12;
letter-spacing: -0.02em;
```

### Body

```css
font-size: 15px;
line-height: 1.6;
```

### Metadata

```css
font-size: 13px;
line-height: 1.4;
color: var(--color-text-muted);
```

Avoid excessive uppercase micro-labels.

Use sentence case when possible.

## 16.3 Spacing

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 40px;
--space-8: 56px;
```

## 16.4 Surfaces

```css
--radius-card: 18px;
--radius-button: 999px;
--radius-small: 10px;

--shadow-review:
  0 24px 80px rgba(20, 28, 24, 0.08),
  0 2px 8px rgba(20, 28, 24, 0.05);
```

---

# 17. Responsive Behavior

## 17.1 Desktop Wide

Use full layout:

```text
collapsed global rail + review rail + review sheet
```

## 17.2 Desktop Narrow

If width < 1180px:

- review rail can collapse into horizontal item switcher
- global sidebar remains collapsed
- review sheet takes full width

## 17.3 Tablet

- global sidebar icon rail
- review rail becomes top horizontal queue
- review sheet full width

## 17.4 Mobile

- Today becomes single-column
- review item opens as in-page full section
- action bar sticky at bottom viewport
- review rail becomes “Reviewing X of Y” with previous/next controls

---

# 18. Accessibility Requirements

- All controls keyboard accessible.
- Collapsed sidebar icons must have accessible labels.
- Status chips must not rely on color only.
- Evidence bars must have text labels.
- Use `aria-expanded` for review state.
- Use `aria-current` for active review rail item.
- Focus should move to review title when entering Review Mode.
- Escape should collapse review unless focus is inside a modal/drawer.
- Motion should respect `prefers-reduced-motion`.

---

# 19. Loading and Error States

## 19.1 Loading Briefing

Show skeleton for:

- briefing text
- primary judgment
- other items
- handled summary

Do not show metric boxes.

## 19.2 Loading Review

When switching review items:

- preserve shell
- skeleton only review sheet content
- rail remains usable if possible

## 19.3 Error Loading Proposed Change

Show:

```text
This proposed change could not be loaded.

[Return to Today] [Try again]
```

## 19.4 Failed Accept

Show inline error:

```text
Fyralis could not apply this change.
No model changes were made.

[Try again] [Report issue]
```

---

# 20. Empty States

## 20.1 No Judgment Needed

```text
Nothing needs your judgment right now.

Fyralis processed 84 signals since your last review.
79 were absorbed.
5 items are being monitored.

[Open Model] [View Ledger] [Ask Fyralis]
```

## 20.2 No Other Items

In Review Mode, if only one item exists:

- hide review rail list
- show compact note:

```text
This is the only item needing judgment.
```

---

# 21. QA Checklist

## Briefing Mode

- [ ] No large metric tile bar at top.
- [ ] Header shows briefing sentence and attention receipt.
- [ ] Fyralis Brief is visible above Primary Judgment.
- [ ] Primary Judgment preview is not the full review sheet.
- [ ] Other items are compact.
- [ ] Handled Without You section reinforces value.
- [ ] Empty metrics are hidden, not shown as dashes.

## Review Mode

- [ ] Global sidebar collapses to icon rail.
- [ ] Sidebar hover expansion overlays without layout shift.
- [ ] Review rail appears and is visually subordinate.
- [ ] Focused review sheet dominates the screen.
- [ ] Current vs Proposed diff is clear and not table-generic.
- [ ] Why This Matters explains consequence.
- [ ] Evidence does not show unexplained “0 signals.”
- [ ] Missing context is visible.
- [ ] Ask Fyralis suggestions are context-aware.
- [ ] Actions are clear and bottom-aligned.
- [ ] Collapse returns to Briefing Mode.

## Interaction

- [ ] Switching rail items does not leave Review Mode.
- [ ] Accept shows confirmation before moving item.
- [ ] Delegate opens a scoped delegation flow.
- [ ] Review Evidence opens a drawer.
- [ ] Report Correction opens correction form.
- [ ] Keyboard shortcuts work.
- [ ] URL query param can open review directly.

---

# 22. Implementation Phases

## Phase 1 — Structural Redesign

- Remove top metric tile bar.
- Add Briefing Mode layout.
- Add Primary Judgment preview.
- Add compact Other Items and Handled Without You sections.

## Phase 2 — Review Mode

- Add adaptive global sidebar collapse.
- Add review rail.
- Add focused review sheet.
- Add review state routing/query param.

## Phase 3 — Ask Fyralis

- Add contextual Ask strip.
- Add suggested prompts.
- Add typed Ask responses.
- Add Ask response cards and action previews.

## Phase 4 — Polish

- Tune typography.
- Tune spacing.
- Improve review sheet visual quality.
- Add motion transitions.
- Add accessibility and responsive behavior.

---

# 23. Final Experience Goal

The final Today page should feel like this:

> Fyralis reviewed the company while the user was away. Most of the noise was absorbed. A few changes need judgment. The user can review each change deeply, act safely, ask questions in context, and move quickly through the queue without ever feeling they left the page.

Today is not a dashboard.

Today is a calm, intelligent re-entry briefing and judgment flow.
