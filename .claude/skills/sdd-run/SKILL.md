---
name: sdd-run
description: Run the full Spec-Driven Development pipeline on a ClickUp task. Triggered by phrases like "run SDD on", "sdd this task", or when the user pastes a ClickUp task body and asks to implement it end-to-end. Walks through specify → clarify → plan → analyze → implement with mandatory human review gates at spec and plan stages.
---

# SDD Pipeline Orchestrator

You are running the spec-driven development pipeline on a ClickUp task the user has provided.

## Input

The user has either pasted a ClickUp task body directly, or referenced a task ID. Expect a structure containing some subset of: task ID (e.g. IN-06), priority tag, title, "Files relevant", "Why it is needed", "How can it be done", "Acceptance criteria", "Estimated effort".

## Pipeline

Execute these phases IN ORDER. Do not skip. Do not reorder. Announce each phase as you enter it.

### Phase 0 — Setup

1. Extract task ID and a short slug from the title (e.g. IN-06, webhook-gateway-router).
2. Create directory `specs/<task-id>-<slug>/`.
3. Write the verbatim ClickUp task body to `specs/<task-id>-<slug>/source.md`.
4. Invoke the speckit-git-feature skill to create a feature branch named `feat/<task-id>-<slug>`.
5. Print: "Setup complete. Branch: feat/<task-id>-<slug>. Proceeding to spec."

### Phase 1 — Specify (autonomous)

1. Invoke the speckit-specify skill. Pass it source.md as input.
2. Verify spec.md was written to the task directory.
3. Do NOT proceed automatically. STOP and print:
   "📋 SPEC GATE — specs/<task-id>-<slug>/spec.md is ready for review.
   Reply 'approve spec' to continue, or give feedback to revise."
4. Wait for user input. If feedback, iterate on spec.md and return to the gate.

### Phase 2 — Clarify (autonomous, only if needed)

1. After spec approval, invoke speckit-clarify.
2. If clarify surfaces ambiguities, present them to the user and wait for resolution.
3. If clarify returns clean, proceed silently to Phase 3.

### Phase 3 — Plan (autonomous)

1. Invoke speckit-plan. Provide stack context from the constitution and source.md.
2. STOP and print:
   "🏗️ PLAN GATE — specs/<task-id>-<slug>/plan.md is ready for review.
   Reply 'approve plan' to continue, or give feedback to revise."
3. Wait. Same iteration loop as Phase 1.

### Phase 4 — Tasks (autonomous, no gate)

1. Invoke speckit-tasks.
2. Print a one-line summary: "N tasks generated. Running analyze."

### Phase 5 — Analyze (autonomous, conditional gate)

1. Invoke speckit-analyze.
2. If analyze flags inconsistencies, gaps, or coverage failures:
   STOP. Print the findings. Wait for user direction.
3. If analyze returns clean, print "✅ Analyze passed. Proceeding to implementation."
   and continue.

### Phase 6 — Implement (autonomous)

1. Invoke speckit-implement.
2. After each task within implement, ensure tests pass. If a task fails:
   STOP. Print which task failed and the failure mode. Wait for direction.
   Do not retry or skip.
3. When all tasks complete, invoke speckit-git-validate.
4. If validate passes, invoke speckit-git-commit with a structured message
   referencing the task ID.

### Phase 7 — Done

Print: "🎉 <task-id> complete. Branch feat/<task-id>-<slug> is ready for PR."

## Hard rules

- The spec gate and plan gate are NON-NEGOTIABLE. Do not auto-advance through them even if the user previously said "just do everything." The gates exist to prevent unrecoverable downstream waste.
- The analyze gate fires conditionally — only when analyze itself flags problems.
- The implement gate fires conditionally — only when a task fails.
- If any phase produces output that contradicts the constitution at `.specify/memory/constitution.md`, STOP and surface the contradiction. Do not silently resolve it.
- Never edit files outside `specs/<task-id>-<slug>/` during phases 1–5. Implementation in phase 6 is bounded by the "Files relevant" list in source.md.
