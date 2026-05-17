// Mock fixture for the Today page v2 (USE_MOCK=1 dev + e2e tests).
// Mirrors the wire shape served by services/gateway/today_routes.py.
//
// Two-pane scenario:
//   - Primary judgment: Salesforce sync escalation (needs_authority)
//   - 3 other changes: pricing decision, delivery delegation,
//     people/teams monitoring
//   - 1 delegated, 1 monitoring already handled

import type {
  ApplyResult,
  CorrectionBody,
  CorrectionResult,
  DecisionDelta,
  DelegateBody,
  DelegateResult,
  EvidenceResponse,
  TodayPageData,
} from "./today-page-types";

const NOW = "2026-05-17T13:40:00Z";
const SINCE = "2026-05-16T18:00:00Z";

const PRIMARY: DecisionDelta = {
  id: "delta-primary-001",
  title: "Escalate customer risk for Salesforce sync instability",
  userFacingType: "proposed_change",
  internalType: "decision_delta",
  status: "needs_authority",
  priorityRank: 0,
  sourceCategory: "customers_revenue",
  relatedCategories: ["customers_revenue", "systems_capacity", "commitments"],
  proposedBy: "fyralis",
  createdAt: "2026-05-17T13:19:00Z",
  updatedAt: "2026-05-17T13:19:00Z",
  currentState: [
    { key: "risk", label: "Risk level", value: "Watch", valueType: "status", severity: "watch" },
    { key: "owner", label: "Owner", value: "Unassigned", valueType: "owner", severity: "neutral" },
    { key: "reeval", label: "Re-evaluate", value: "7 days", valueType: "duration", severity: "neutral" },
  ],
  proposedState: [
    { key: "risk", label: "Risk level", value: "Critical", valueType: "status", severity: "critical" },
    { key: "owner", label: "Owner", value: "VP Engineering", valueType: "owner", severity: "neutral" },
    { key: "reeval", label: "Re-evaluate", value: "48 hours", valueType: "duration", severity: "watch" },
  ],
  summaryLine: "Watch → Critical",
  whyThisMatters:
    "Three anchor customers are reporting recurring Salesforce sync failures. Renewal exposure is increasing as confidence in sync reliability declines.",
  keyMetrics: [
    { label: "$2.04M ARR", value: "$2.04M", unit: "ARR", severity: "critical" },
    { label: "3 customers", value: 3, unit: "customers", severity: "medium" },
    { label: "12 signals", value: 12, unit: "signals", severity: "medium" },
    { label: "78% confidence", value: 78, unit: "percent", severity: "high" },
  ],
  evidenceSummary: {
    totalSignals: 12,
    quality: "strong",
    groups: [
      { id: "src-support", label: "Support tickets", sourceType: "support", count: 5, quality: "strong", strengthScore: 0.92 },
      { id: "src-crm", label: "CRM logs", sourceType: "crm", count: 4, quality: "strong", strengthScore: 0.88 },
      { id: "src-email", label: "Email & threads", sourceType: "email", count: 3, quality: "partial", strengthScore: 0.55 },
    ],
  },
  missingContext: [
    { id: "miss-1", text: "No recent Beacon call transcript", severity: "medium" },
    { id: "miss-2", text: "Account owner has not confirmed severity", severity: "medium" },
  ],
  impactIfAccepted: [
    { id: "op-1", text: "Create escalation in Risks & Constraints", operationType: "create_node", severity: "positive" },
    { id: "op-2", text: "Notify VP Engineering and account owners", operationType: "notify_actor", severity: "neutral" },
    { id: "op-3", text: "Link 3 renewal commitments", operationType: "link_nodes", severity: "neutral" },
    { id: "op-4", text: "Schedule re-evaluation in 48h", operationType: "schedule_re_evaluation", severity: "neutral" },
    { id: "op-5", text: "Record ledger event for audit trail", operationType: "create_ledger_event", severity: "neutral" },
  ],
  relatedModelLinks: [
    { category: "risks_constraints", label: "Risks & Constraints", href: "/model?focus=category&categoryId=risks_constraints" },
    { category: "customers_revenue", label: "Customers & Revenue", href: "/model?focus=category&categoryId=customers_revenue" },
    { category: "commitments", label: "Commitments", href: "/model?focus=category&categoryId=commitments" },
  ],
  availableActions: ["accept", "delegate", "review_evidence", "report_correction"],
  applyPreview: {
    nodeOpsCount: 4,
    notificationsCount: 2,
    reEvaluationScheduledAt: "2026-05-19T13:19:00Z",
    ledgerEventWillBeCreated: true,
  },
  targetNodeKind: "customer",
  targetNodeId: "00000000-0000-4000-a000-000000000001",
  confidence: 0.78,
  resolutionTargetAt: "2026-05-19T13:19:00Z",
  evidence: [
    { id: "ev-1", source: "support", sourceLabel: "Support tickets", title: "Sync failure ticket #441", occurredAt: "2026-05-14T09:21:00Z", trustTier: "attested", quality: "strong", excerpt: "Beacon reported recurring Salesforce sync failures affecting renewal reporting.", ordinal: 0 },
    { id: "ev-2", source: "support", sourceLabel: "Support tickets", title: "Sync failure ticket #449", occurredAt: "2026-05-15T11:02:00Z", trustTier: "attested", quality: "strong", excerpt: "Northvale ops escalation — sync down 2h.", ordinal: 1 },
    { id: "ev-3", source: "crm", sourceLabel: "CRM logs", title: "Account: Beacon — health declining", occurredAt: "2026-05-16T08:11:00Z", trustTier: "verified", quality: "strong", excerpt: "Account health moved from B to C; sync uptime flagged.", ordinal: 2 },
    { id: "ev-4", source: "email", sourceLabel: "Email & threads", title: "Thread: Beacon QBR follow-up", occurredAt: "2026-05-16T22:40:00Z", trustTier: "secondhand", quality: "partial", excerpt: "Customer asked when fix lands; renewal due July.", ordinal: 3 },
  ],
};

const OTHER_PRICING: DecisionDelta = {
  id: "delta-other-pricing",
  title: "Assign owner for pricing model decision",
  userFacingType: "proposed_change",
  internalType: "decision_delta",
  status: "delegatable",
  priorityRank: 1,
  sourceCategory: "decisions",
  relatedCategories: ["decisions", "customers_revenue", "finance_capital"],
  proposedBy: "fyralis",
  createdAt: "2026-05-17T11:58:00Z",
  updatedAt: "2026-05-17T11:58:00Z",
  currentState: [
    { key: "owner", label: "Owner", value: "Unowned", valueType: "owner", severity: "neutral" },
  ],
  proposedState: [
    { key: "owner", label: "Owner", value: "CFO", valueType: "owner", severity: "neutral" },
  ],
  summaryLine: "Unowned → CFO",
  whyThisMatters:
    "Two commitments are blocked pending a pricing decision. Decision due in 5 business days.",
  keyMetrics: [
    { label: "$720K opportunity", value: "$720K", unit: "opportunity", severity: "high" },
    { label: "2 commitments blocked", value: 2, unit: "commitments", severity: "medium" },
    { label: "9 signals", value: 9, unit: "signals", severity: "medium" },
  ],
  evidenceSummary: {
    totalSignals: 9,
    quality: "medium",
    groups: [
      { id: "src-slack", label: "Slack threads", sourceType: "slack", count: 4, quality: "medium" },
      { id: "src-crm", label: "CRM logs", sourceType: "crm", count: 3, quality: "strong" },
      { id: "src-finance", label: "Finance system", sourceType: "finance", count: 2, quality: "medium" },
    ],
  },
  missingContext: [],
  impactIfAccepted: [
    { id: "op-1", text: "Assign CFO as owner", operationType: "update_node" },
    { id: "op-2", text: "Notify CFO with context", operationType: "notify_actor" },
    { id: "op-3", text: "Schedule re-evaluation in 5d", operationType: "schedule_re_evaluation" },
    { id: "op-4", text: "Record ledger event for audit trail", operationType: "create_ledger_event" },
  ],
  relatedModelLinks: [
    { category: "decisions", label: "Decisions", href: "/model?focus=category&categoryId=decisions" },
  ],
  availableActions: ["delegate", "accept", "review_evidence", "report_correction"],
  applyPreview: { nodeOpsCount: 1, notificationsCount: 1, reEvaluationScheduledAt: "2026-05-22T11:58:00Z", ledgerEventWillBeCreated: true },
  confidence: 0.65,
};

const OTHER_DELIVERY: DecisionDelta = {
  id: "delta-other-delivery",
  title: "Reassign delivery owner for Northvale onboarding",
  userFacingType: "proposed_change",
  internalType: "decision_delta",
  status: "delegatable",
  priorityRank: 2,
  sourceCategory: "commitments",
  relatedCategories: ["commitments", "people_teams"],
  proposedBy: "fyralis",
  createdAt: "2026-05-17T09:11:00Z",
  updatedAt: "2026-05-17T09:11:00Z",
  currentState: [{ key: "owner", label: "Owner", value: "Mira Chen", valueType: "owner" }],
  proposedState: [{ key: "owner", label: "Owner", value: "Tom Reilly", valueType: "owner" }],
  summaryLine: "Mira → Tom",
  whyThisMatters: "Mira is over capacity and Northvale onboarding is at risk.",
  keyMetrics: [
    { label: "$340K ARR", value: "$340K", unit: "ARR", severity: "high" },
    { label: "1 customer", value: 1, unit: "customers", severity: "low" },
    { label: "5 signals", value: 5, unit: "signals", severity: "low" },
  ],
  evidenceSummary: {
    totalSignals: 5,
    quality: "medium",
    groups: [
      { id: "src-linear", label: "Linear", sourceType: "linear", count: 3, quality: "medium" },
      { id: "src-calendar", label: "Calendar", sourceType: "calendar", count: 2, quality: "partial" },
    ],
  },
  missingContext: [],
  impactIfAccepted: [
    { id: "op-1", text: "Reassign commitment to Tom Reilly", operationType: "update_node" },
    { id: "op-2", text: "Notify Mira, Tom, and Northvale account owner", operationType: "notify_actor" },
    { id: "op-3", text: "Record ledger event for audit trail", operationType: "create_ledger_event" },
  ],
  relatedModelLinks: [
    { category: "commitments", label: "Commitments", href: "/model?focus=category&categoryId=commitments" },
  ],
  availableActions: ["delegate", "accept", "review_evidence", "report_correction"],
  applyPreview: { nodeOpsCount: 1, notificationsCount: 3, ledgerEventWillBeCreated: true },
  confidence: 0.58,
};

const OTHER_MONITORING: DecisionDelta = {
  id: "delta-other-monitoring",
  title: "Monitor team capacity drift in Platform",
  userFacingType: "proposed_change",
  internalType: "decision_delta",
  status: "monitoring",
  priorityRank: 3,
  sourceCategory: "systems_capacity",
  relatedCategories: ["systems_capacity", "people_teams"],
  proposedBy: "fyralis",
  createdAt: "2026-05-17T07:02:00Z",
  updatedAt: "2026-05-17T07:02:00Z",
  currentState: [{ key: "capacity", label: "Capacity utilization", value: "Stable" }],
  proposedState: [{ key: "capacity", label: "Capacity utilization", value: "Drift detected" }],
  summaryLine: "Stable → Drift detected",
  whyThisMatters: "Throughput trending down 8% week-over-week. Watching for sustained pattern.",
  keyMetrics: [
    { label: "0 customers", value: 0, unit: "customers", severity: "low" },
    { label: "6 signals", value: 6, unit: "signals", severity: "low" },
  ],
  evidenceSummary: {
    totalSignals: 6,
    quality: "partial",
    groups: [
      { id: "src-linear", label: "Linear", sourceType: "linear", count: 4, quality: "partial" },
      { id: "src-product", label: "Product events", sourceType: "product", count: 2, quality: "partial" },
    ],
  },
  missingContext: [],
  impactIfAccepted: [
    { id: "op-1", text: "Open monitoring on Platform capacity", operationType: "update_node" },
    { id: "op-2", text: "Schedule re-evaluation in 7d", operationType: "schedule_re_evaluation" },
    { id: "op-3", text: "Record ledger event for audit trail", operationType: "create_ledger_event" },
  ],
  relatedModelLinks: [
    { category: "systems_capacity", label: "Systems & Capacity", href: "/model?focus=category&categoryId=systems_capacity" },
  ],
  availableActions: ["accept", "review_evidence", "open_model", "snooze"],
  applyPreview: { nodeOpsCount: 1, notificationsCount: 0, reEvaluationScheduledAt: "2026-05-24T07:02:00Z", ledgerEventWillBeCreated: true },
  confidence: 0.52,
};

export const TODAY_PAGE_FIXTURE: TodayPageData = {
  viewer: {
    userId: "actor-rachin",
    name: "Rachin",
    role: "CEO",
    tenantId: "tenant-fyralis-demo",
  },
  lastReviewAt: SINCE,
  generatedAt: NOW,
  summary: {
    signalsProcessed: 98,
    signalsAbsorbed: 94,
    modelUpdates: 12,
    needJudgment: 4,
    requiresAuthority: 1,
    delegatable: 2,
    monitoring: 1,
    contested: 0,
    exposure: { amount: 2_040_000, currency: "USD", formatted: "$2.04M" },
  },
  primaryJudgment: PRIMARY,
  otherChanges: [OTHER_PRICING, OTHER_DELIVERY, OTHER_MONITORING],
  handledWithoutYou: {
    signalsAbsorbed: 94,
    modelUpdatesApplied: 6,
    itemsUnderMonitoring: 3,
    delegatedChanges: 1,
    contestedChanges: 0,
    reassuranceCopy:
      "Fyralis continuously monitors the model and will resurface anything that needs you.",
  },
};

const ALL: Record<string, DecisionDelta> = Object.fromEntries(
  [PRIMARY, OTHER_PRICING, OTHER_DELIVERY, OTHER_MONITORING].map((d) => [d.id, d]),
);

// In-memory mutation tracker so the mock survives the round-trip of an
// apply / delegate / correction call. We don't persist beyond the
// session — refresh resets the state.
const MUTATED: Map<string, DecisionDelta> = new Map();

function withMutations(d: DecisionDelta): DecisionDelta {
  return MUTATED.get(d.id) ?? d;
}

export function mockGetTodayPage(): TodayPageData {
  const primary = withMutations(PRIMARY);
  const others = [OTHER_PRICING, OTHER_DELIVERY, OTHER_MONITORING].map(withMutations);
  return {
    ...TODAY_PAGE_FIXTURE,
    primaryJudgment:
      primary.status === "accepted" || primary.status === "archived"
        ? null
        : primary,
    otherChanges: others.filter(
      (d) => d.status !== "accepted" && d.status !== "archived",
    ),
  };
}

export function mockGetDelta(id: string): DecisionDelta | null {
  const d = ALL[id];
  if (!d) return null;
  return withMutations(d);
}

export function mockGetEvidence(id: string): EvidenceResponse | null {
  const d = ALL[id];
  if (!d) return null;
  return {
    deltaId: id,
    totalSignals: d.evidenceSummary.totalSignals,
    evidenceGroups: d.evidenceSummary.groups,
    items: d.evidence ?? [],
  };
}

export function mockApply(id: string): ApplyResult | null {
  const d = ALL[id];
  if (!d) return null;
  const updated: DecisionDelta = {
    ...d,
    status: "accepted",
    updatedAt: new Date().toISOString(),
  };
  MUTATED.set(id, updated);
  const remaining = [PRIMARY, OTHER_PRICING, OTHER_DELIVERY, OTHER_MONITORING]
    .map(withMutations)
    .filter((x) => x.id !== id && x.status !== "accepted" && x.status !== "archived");
  return {
    status: "applied",
    resultMessage: `Change accepted. ${
      d.impactIfAccepted.length > 0
        ? `Executed ${d.impactIfAccepted.length} operation${d.impactIfAccepted.length === 1 ? "" : "s"}.`
        : "Recorded ledger event."
    }`,
    updatedDelta: updated,
    nextDeltaId: remaining[0]?.id ?? null,
    ledgerEventId: `ledger-${id}-mock`,
  };
}

export function mockDelegate(id: string, body: DelegateBody): DelegateResult | null {
  const d = ALL[id];
  if (!d) return null;
  const updated: DecisionDelta = {
    ...d,
    status: "delegated",
    annotations: {
      ...(d.annotations ?? {}),
      delegation: {
        owner_id: body.delegateToActorId,
        message: body.message ?? null,
        due_at: body.dueAt ?? null,
        notify_now: body.notifyNow,
        monitor_confirmation: body.monitorConfirmation,
        at: new Date().toISOString(),
      },
    },
  };
  MUTATED.set(id, updated);
  return {
    status: "delegated",
    resultMessage: "Delegated. Fyralis will monitor for confirmation.",
    updatedDelta: updated,
  };
}

export function mockCorrection(
  id: string,
  body: CorrectionBody,
): CorrectionResult | null {
  const d = ALL[id];
  if (!d) return null;
  const updated: DecisionDelta = {
    ...d,
    status: "correction_submitted",
    annotations: {
      ...(d.annotations ?? {}),
      correction: {
        type: body.correctionType,
        explanation: body.explanation,
        supporting_link: body.supportingLink ?? null,
        apply_to_related: body.applyToRelatedItems ?? false,
        by: "actor-rachin",
        at: new Date().toISOString(),
      },
    },
  };
  MUTATED.set(id, updated);
  return {
    status: "correction_submitted",
    resultMessage:
      "Correction submitted. Fyralis will re-evaluate this change and any dependent model items.",
    updatedDelta: updated,
  };
}

// Test-only: reset all in-memory mutations between e2e tests.
export function _resetTodayPageMock() {
  MUTATED.clear();
}
