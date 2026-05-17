# Fyralis Ingestion — Canonical System Design

**Status:** Reference specification. This document is the source of truth for the ingestion subsystem's architectural intent. All other documents (`01-current-state.md`, `02-high-level-design.md`, `03-low-level-design.md`, `04-implementation-plan.md`) are derivatives — interpretations, decompositions, and implementations of what is stated here.

**When the four documents disagree, this document arbitrates.**

**Version:** 1.0. Future amendments must be additive (new sections, refined rationales) or explicitly versioned (a section's "v1 said X, v2 says Y" with retraction reason). The system design is the contract; it does not silently drift.

**Coherence audit log:**
- 2026-05-17 — coherence audit ran against `01..04`. No N1–N5 violations found. Five drift items identified and corrected: (a) HLD Component Inventory updated to attribute `feels_onboarded` emission to `FeelsOnboardedMonitorWorkflow` (newly added inventory row), correcting a stale claim that `SourceOnboardingWorkflow` emits it; (b) LLD §3.1 narrative for Slack recency scoring corrected to match the `exp(-age_days/7)` code; (c)–(e) each of `01..04` now declares `00-system-design.md` as canonical reference in its header, and `04` declares per-milestone non-negotiable mapping so scope-cuts are auditable. No changes to N1–N5 themselves; the canonical contract is unchanged.

---

## 0. What this document is — and is not

This document answers the architectural question: **how do we ingest a tenant's full historical data across multiple sources (Slack, GitHub, Discord, Gmail today; more later) such that onboarding is fast, reliable, and never loses data?**

It is:
- A statement of architectural intent and non-negotiable principles.
- The contract that downstream documents (HLD/LLD/Implementation Plan) must satisfy.
- A grounded justification for every major design choice, traceable to a constraint.

It is not:
- A high-level design (that is `02-high-level-design.md`).
- A low-level implementation reference (that is `03-low-level-design.md`).
- A migration plan (that is `04-implementation-plan.md`).
- A statement of the current codebase (that is `01-current-state.md`).

**Reading order:** people new to the system read this first, then `02-high-level-design.md`, then drop into `03-low-level-design.md` for specifics. People modifying existing code read `01-current-state.md` first, then come back here to check intent.

---

## 1. The problem in one paragraph

Fyralis is an organizational intelligence runtime. When a tenant connects a source (their Slack workspace, GitHub org, Discord server, Gmail domain), the system must ingest **all of that source's historical data** — potentially years of messages, commits, threads — so Fyralis can answer questions about the organization's past, not just react to events after install. The data is large (a mid-size company over 2 years is roughly 14M records, dominated by Gmail and Slack), the source APIs are rate-limited (Slack's tier-3 limits are the long pole), and the user experience must feel responsive: most "feels onboarded" value lands in the first 5% of data, so recency-first ordering matters more than total throughput. Steady-state webhook ingestion must also keep working. The system must never lose data, must be replayable from raw, and must isolate tenants so one cannot starve another.

That paragraph defines the entire problem. The rest of this document is what the system must do to satisfy it.

---

## 2. The five non-negotiables

These are the architectural commitments that have survived every verification round. If a future design choice contradicts one of these, the design choice is wrong by default — overriding requires explicit retraction of the non-negotiable with reasoning.

### N1. Never lose data.

Data loss is the single failure mode the entire architecture is built to prevent. Every other property (speed, simplicity, cost) is negotiable in service of this one. Concretely:

- Every fetched page lands in durable raw storage (S3/R2, content-hashed) **before** any acknowledgment to the source or any cursor advancement.
- Cursors advance only after the data they reference has been durably persisted downstream. Cursor advancement is a separate Temporal activity from page fetch — never collapsed into one step. This is the cursor-data ordering invariant.
- Idempotency keys are constructed from source-native stable identifiers. Re-fetching, re-publishing, and re-inserting the same logical record is a no-op at the storage layer, not at the application layer.
- All failures land in a DLQ with a pointer to the raw payload. Nothing is silently dropped. Parse failures, insert failures, rate-limit-exhausted failures — all observable, all replayable.

The cursor-data ordering invariant is the most violation-prone of these. It must be a named, tested property of the system, not a property that emerges accidentally from code structure.

### N2. Replayable from raw.

Every byte the system receives from a source — webhook bodies, Gateway frames, API responses, Pub/Sub-triggered fetches — is stored in S3/R2 before any transformation, keyed by content hash, with `PutIfAbsent` semantics. Re-running normalization against stored raw produces identical observations without re-hitting any source.

This exists because: (a) normalization logic will have bugs, and fixing them must not require re-ingesting from sources; (b) schemas evolve, and historical raw must remain re-derivable under new schemas; (c) audit and compliance require a verifiable origin for every observation. Without this, every normalization bug becomes an incident; with it, it becomes a replay.

The raw tier is not an optimization. It is a correctness foundation.

### N3. Per-tenant fault isolation.

One tenant's pathological behavior — a runaway Slack workspace with 10M messages, a Discord bot returning malformed payloads, a Gmail mailbox with thread cycles — cannot exhaust resources for other tenants. Concretely:

- Kafka topics partitioned by `tenant_id`. A noisy tenant queues up behind their own partition; other tenants' partitions process independently.
- Rate-limit token buckets are per-`(tenant, source, method)`. Bucket exhaustion blocks only the owning tenant.
- DB connection pools are per-worker-class. A runaway in one class cannot starve another.
- Normalizer process pool is OS-isolated. A CPU-pathological payload from one tenant runs in one process; others continue.

Fairness across tenants is not perfectly addressed: cross-tenant scheduling on shared task queues is FIFO. This is acceptable for v1; premium-tier per-tenant task queues are an opt-in path. **Documented and accepted, not hidden.**

### N4. The user's "feels onboarded" moment is content-defined, not time-defined.

A backfill that takes 8 hours to complete is not a problem if the user feels onboarded within 15 minutes. A backfill that "completes" in 15 minutes but leaves recent data missing is a problem regardless of the elapsed time.

The system measures "feels onboarded" by content state: *the last 7 days of observations for a source are queryable, with the source-side count gap below the reconciliation threshold (0.1% or 5 absolute messages, whichever is larger).* It is not measured by elapsed time, completion percentage, or workflow milestones.

A separate, ops-only signal fires when 15 minutes elapse without any source reaching `feels_onboarded`. This is a backfill-health alert, not a user-facing event.

Recency-first planning is the mechanism that makes this work: shards are scored by `exp(-age_days/τ)` and executed highest-score-first, so user-perceived value lands in the first 5% of data even when total backfill takes hours.

### N5. Webhook and backfill converge at one normalization plane.

Webhooks, Gateway frames, Pub/Sub pushes, and backfill-fetched pages all converge at a single Kafka topic (`ingestion.raw`). One normalizer pool consumes all three sources; the existing handler registry produces observations from each. The downstream observation writer, embedding worker, and graph projection do not know or care whether a record arrived via real-time push or historical fetch.

This is what lets us reuse the existing handler logic and observation-insert path while adding a backfill capability above them. It also means: any improvement to the normalization plane — schema evolution, additional event types, embedding model changes — applies uniformly to backfill and steady-state without divergence.

The webhook ingress path retains its security work (signature verification, replay-cache for GitHub, tenant resolution) but stops short of calling `ingest()` synchronously. The HTTP 200 is returned as soon as raw is durable in S3 and the Kafka publish has succeeded.

---

## 3. The architectural shape

The system is two planes with five layers.

```
                    ┌─────────────────────────────────────────┐
                    │            CONTROL PLANE                │
                    │  Temporal (workflows)                   │
                    │  Postgres (metadata: shards, runs)      │
                    │  Redis (rate limiters, leader locks)    │
                    └────────┬────────────────────────┬───────┘
                             │                        │
                  ┌──────────▼─────────┐    ┌─────────▼───────────┐
                  │      INGRESS       │    │     BACKFILL        │
                  │  Webhooks          │    │  Temporal workflows │
                  │  Gateway worker    │    │  Per-source planner │
                  │  Pub/Sub endpoint  │    │  ShardFetchWorkflow │
                  └──────────┬─────────┘    └─────────┬───────────┘
                             │                        │
                             └───────────┬────────────┘
                                         ▼
                          ┌──────────────────────────┐
                          │       DATA PLANE         │
                          │  S3/R2 raw tier          │
                          │  Kafka ingestion.raw     │
                          │  Normalizer pool         │
                          │  Kafka normalized        │
                          │  Observation writer      │
                          │  Postgres observations   │
                          │  Embedding worker        │
                          │  DLQ + recovery          │
                          └──────────────┬───────────┘
                                         │
                                         ▼
                          ┌──────────────────────────┐
                          │       DOWNSTREAM         │
                          │  Bridge Layer            │
                          │  Think Consumer          │
                          │  LISTEN observations_new │
                          └──────────────────────────┘
```

**Why two planes:** the control plane needs strong consistency (cursor positions, workflow state, rate budgets). The data plane needs high throughput and eventual consistency (raw bytes, Kafka, batched writes). Mixing them — putting workflow state on Kafka, or raw bytes in Postgres — couples scaling profiles that should be independent.

**Why ingress and backfill are separate above the data plane:** they have fundamentally different characteristics. Ingress is unbounded, bursty, latency-sensitive. Backfill is bounded, predictable, throughput-sensitive. Unifying them prematurely is the single most common architectural mistake in systems of this shape. They share the data plane (where the convergence per N5 happens) but their control logic is independent.

---

## 4. The control plane

### 4.1 Temporal as the orchestrator

Temporal owns all durable orchestration. Workflows are code (Python SDK), survive worker death, and provide deterministic replay. The three workflow tiers:

- `TenantOnboardingWorkflow` — short. Created from an OAuth outbox row. Fans out to source workflows and exits. Holds no state during the actual backfill.
- `SourceOnboardingWorkflow` — long. One per (tenant, source). Runs the planner, spawns shard children, runs reconciliation.
- `ShardFetchWorkflow` — one per shard. Drives the per-shard fetch loop. Workflow IDs are deterministic so restarts are idempotent.

Polling logic that runs across all active runs (the `feels_onboarded` check, the circuit breaker) is in **separate** workflows on Temporal Schedules, not inside the source workflows. This bounds source-workflow history size to shard count, not elapsed wall time.

Why Temporal and not a custom orchestrator: durable execution, deterministic replay, and per-workflow-id mutex are all properties Temporal provides natively. Building these correctly takes 12+ months of engineering. Buying them is one operational dependency.

### 4.2 Postgres for workflow-adjacent metadata

Six tables hold the metadata Temporal can't (because it's relational, queryable, and operated on by both workflows and ad-hoc tools):

- `onboarding_runs` — one row per tenant-onboarding execution.
- `onboarding_shards` — the unit of fetch work; recency-scored, time-windowed.
- `ingestion_failures` — DLQ mirror, queryable for ops.
- `onboarding_triggers` — OAuth outbox (transactional with install).
- `gateway_session_state` — Discord session persistence.
- `tenant_flags` — cutover flag + writer-mode opt-in.

All tenant-scoped tables have RLS policies. Cross-tenant queries (the trigger poller, the circuit breaker) run with the service role.

### 4.3 Redis for ephemeral coordination

Three concerns live in Redis:

- **Token buckets** for rate limiting, Lua-scripted for atomicity, one per `(tenant, source, method)`. Honors source-provided `Retry-After` hints via a lockout mechanism that overrides token math.
- **Leader locks** for the Discord Gateway worker (single-shard v1), with Redis-mirrored state in `gateway_session_state` for diagnostics.
- **Short-window dedup hints** (`SETNX` with 10-min TTL) as defense-in-depth above the observation `UNIQUE` constraint. Failure of Redis is degraded performance, not data loss.

---

## 5. The data plane

### 5.1 Raw tier — content-hashed, immutable, replayable

S3/R2 keyed by:

```
s3://fyralis-raw/{env}/{source}/{tenant_id}/{yyyy-mm}/{content_hash[:2]}/{content_hash}.json.zst
```

- `PutIfAbsent` semantics via `If-None-Match: *`. Duplicate writes are no-ops.
- zstd compression (level 3 default).
- 90-day retention for backfill raw, 30-day for steady-state. Configurable per-tenant for compliance.

The Kafka envelope on `ingestion.raw` is a pointer (~1-4 KB) carrying `raw_s3_key`, `content_hash`, `ingress_kind`, `tenant_id`, and `idem_hints`. Bodies are in S3; envelopes are small. Kafka throughput scales on message count, not byte count.

### 5.2 Normalizer pool — pure transform, no DB access

Multiprocessing pool, one process per core. Each process runs an asyncio event loop with one aiokafka consumer. Cooperative-sticky partition assignment.

**Path B (verified in Phase 2.1 Q F4):** the normalizer is pure transform. It pulls raw from S3, dispatches through the existing handler registry, produces `ObservationDraft` JSON, publishes to `ingestion.normalized`. **It does not touch Postgres.** All DB enrichment (actor resolution, entity-alias lookup, observation INSERT, thread canonicalization) happens in the writer.

This is non-negotiable because: the GIL makes JSON parsing + Pydantic validation CPU-bound. Per-core processes give linear scaling on transform throughput. Mixing DB access in introduces I/O-blocking and multiplies the connection count by core count, which a single Postgres instance cannot sustain.

### 5.3 Observation writer — batched, idempotent, atomic

aiokafka consumer + asyncpg writer. Batches up to 500 observations per transaction. The transaction does, atomically:

1. Batched actor resolution (one query).
2. Batched entity-alias lookup via the functional index on the normalized form (one query).
3. Gmail thread canonicalization (one query for parent lookups + batched INSERTs into canonical/members tables).
4. Multi-row `INSERT INTO observations` with `ON CONFLICT (source_channel, external_id, occurred_at) DO NOTHING`.
5. Multi-row `INSERT INTO think_trigger_queue`.
6. Post-commit `NOTIFY observations_new` (per row, batched).
7. Publish `ingestion.embedding` events for rows where embedding is needed.

Per-observation query count: ~7 (was ~54 in the inline path). This is the single largest performance improvement in the migration.

**Dual-mode design:** the writer supports two operating modes:
- *Batched (default):* `max_poll_records=500`, ~500ms batch wait, ~1000 rows/sec/process.
- *Low-latency (opt-in per tenant):* `max_poll_records=1`, single-row commits, ~50ms per row, ~50 rows/sec/process.

The mode is selected per-tenant via `tenant_flags.flag_value WHERE flag_name='ingestion.writer_mode_low_latency'`. This exists because: the WS dashboard's `LISTEN observations_new` subscriber has drop-oldest queue semantics implying a freshness-over-completeness contract. The cutover's ~100ms → ~1-5s latency regression crosses the threshold where users may notice. The product decision about whether 1-5s is acceptable determines the default mode.

### 5.4 Embedding worker — decoupled from the writer path

Separate Kafka topic (`ingestion.embedding`). Smaller batches (10 records). Ollama is the bottleneck (~50-200 embeds/sec sustained). Failed embeddings retry; after N retries, land in DLQ.

The **backlog** of pre-existing `embedding_pending=TRUE` rows is handled by a separate one-shot script reading directly from Postgres, not through Kafka. This isolates backlog work from steady-state Ollama capacity. Without this split, a large backlog could starve live embeddings for days.

### 5.5 DLQ — every failure has a home

Two surfaces:
- Kafka topic `ingestion.dlq` — the durable event log.
- Postgres `ingestion_failures` — the queryable mirror, used by ops.

Every parse failure, every insert failure, every rate-limit-exhausted-beyond-retry failure publishes to both. Each row has a `raw_s3_key` pointer when applicable; replay reads the raw and re-publishes to `ingestion.raw`. The deduplication property (source-native external_id + observation UNIQUE) makes replay safe to run repeatedly.

---

## 6. Idempotency — the correctness floor

### 6.1 Source-native stable identifiers

Every observation has an `external_id` constructed from a source-native, stable identifier:

| Source | external_id formula | Why this identifier |
|---|---|---|
| Slack | `{channel_id}:{event.ts}` | `ts` is microsecond-precise per-channel, server-allocated, immutable across edits. Channel IDs (`C…`) are globally unique. |
| GitHub | `{node_id}` (object events); `{repo_full_name}@{after_sha}` (push) | `node_id` is the GraphQL global ID — version-stamped, globally unique. Commit SHAs are commit-immutable. |
| Discord | `discord:{snowflake_id}` | Snowflakes are 64-bit globally-allocated IDs; canonical and never reused. |
| Gmail | `gmail:{install_id}:{rfc5322_message_id}` | RFC 5322 Message-ID is globally unique by spec; survives Gmail's internal `id` churn (label moves, archive). |

**The Gmail identifier choice is the most consequential one.** Using Gmail's internal `id` (the natural-looking option) breaks under label moves and produces silent duplicates. The codebase already uses RFC 5322 Message-ID; this must be preserved across backfill and steady-state.

### 6.2 The observation UNIQUE constraint

`UNIQUE(source_channel, external_id, occurred_at)`.

`occurred_at` is in the key because handlers for stateful entities (GitHub PRs, issues, comments, reviews, check_runs, Linear issues, Calendar events) produce **one observation per state transition** with the same `external_id` and a fresh `occurred_at`. Removing `occurred_at` from the key would silently reject those updates.

`tenant_id` is NOT in the key. This is safe because every source's native identifier is globally unique by construction. Adding `tenant_id` would tighten the invariant unnecessarily; the cost is non-zero (index size, query plan changes) and the benefit is zero.

This is the design's strongest correctness guarantee. It must not be weakened without a full impact analysis.

### 6.3 The cursor-data ordering invariant

For any fetched page:

1. The raw body is written to S3 with `PutIfAbsent`. If S3 fails, the activity fails and Temporal retries.
2. A pointer envelope is published to `ingestion.raw`. If Kafka fails, the activity fails and Temporal retries.
3. **Only after both succeed**, a separate Temporal activity advances the cursor.

A crash between step 2 and step 3 means: the data is in S3 and Kafka (will be processed downstream), and the cursor still points at the pre-fetch position. On retry: the same page is fetched, S3 is a no-op (content-hash collision is success), Kafka receives a duplicate envelope (consumer dedups), observation INSERT is rejected (UNIQUE). Net effect: zero data loss, zero duplicates.

A crash between step 1 and step 2 means: the data is in S3 but no envelope was published. The cursor is unchanged. On retry: same page fetched, same content hash, same path. Net effect: identical.

This ordering is the system's most important correctness invariant. The Temporal activity boundary between "fetch + publish" and "advance cursor" is what enforces it. Collapsing them into one activity breaks the invariant.

---

## 7. The user-facing contract: `feels_onboarded`

### 7.1 The signal's meaning

`source.onboarding.feels_onboarded` fires when:

> The last 7 days of observations for this source are queryable. Specifically: the source-side count of events in `[now - 7d, now]` minus the observation-side count for the same window is below the reconciliation threshold (0.1% or 5 absolute messages, whichever is larger).

This is content-defined, not time-defined. A backfill that takes 30 minutes can fire `feels_onboarded` at minute 8 if the last 7 days landed first. A backfill that runs 4 hours but spends time on old data first does not fire `feels_onboarded` until the recent window catches up.

### 7.2 The mechanism

A separate Temporal workflow (`FeelsOnboardedMonitorWorkflow`) runs on a 30-second Schedule. It scans active onboarding runs, measures the recency gap per source, and emits the event when the threshold is met. The update is transactional: `UPDATE onboarding_runs SET feels_onboarded_at = now() WHERE id = $1 AND feels_onboarded_at IS NULL` — atomic, idempotent. Only if the UPDATE affected 1 row does the Kafka event get published.

The polling lives outside the source workflow so source workflow history stays bounded by shard count, not by elapsed wall time.

### 7.3 The ops-only fallback

A separate event, `tenant.onboarding.behind_schedule`, fires if 15 minutes elapse since `tenant.onboarding.started` and no source has emitted `feels_onboarded`. This is for ops alerting only — it never reaches user-facing UI. The 15-minute threshold is a backfill-health indicator, not a backfill-completion signal.

---

## 8. Recency-first planning

### 8.1 The principle

User-perceived value is concentrated in recent data. The 7-day, 30-day, and 90-day windows produce qualitatively different value: "what's happening this week," "this month's recurring topics," "this quarter's patterns." A user opening the app within minutes of install cares about the first; the rest is depth.

The planner orders shards so that the most-recent windows are fetched first, across all channels/repos/mailboxes. A 2-year-old channel's last-30-days shard runs before its 18-months-ago shard, regardless of channel.

### 8.2 The scoring function

Shards are scored by `recency_score = exp(-age_days / τ)`, where `age_days` is the age of the shard's `window_end` and `τ` is a per-source decay constant (Slack/Discord: 7 days; GitHub: 14 days; Gmail: 7 days). Higher score = earlier in priority.

The shard table has an index on `(source, recency_score DESC) WHERE state = 'pending'` so the planner can pop highest-priority pending shards without touching done shards.

### 8.3 What this is not

Recency-first is not "fetch only recent data." It is "fetch recent data first, then keep going." Full historical backfill still completes; it just completes after the user-perceived value has landed. Total throughput is unchanged; perceived throughput is dramatically improved.

---

## 9. Rate limiting — adaptive, centralized, source-aware

### 9.1 The bucket topology

One token bucket per `(tenant_id, source, method)`. Implemented in Redis with Lua scripts for atomicity. Every outbound API call from any worker — backfill fetcher, webhook outbound, Gmail history poller, Discord follow-up — acquires from the same bucket.

Per-source defaults are set at 80% of the source's published rate limit. The remaining 20% is headroom for steady-state ingestion to run concurrently with backfill.

### 9.2 The `Retry-After` lockout

When a source returns 429 with `Retry-After`, the fetcher reports the duration to the bucket via a second Lua script. The bucket sets a `lockout_until_ms` field; subsequent acquires are denied until the lockout expires, **regardless of token math**.

This means the source's hint dominates our token math. We never thrash by hammering a budget that the source has already told us is exhausted. This is the difference between "we hit 429s sometimes" (acceptable) and "we got tier-throttled to 25% of our usual rate for 6 hours because we ignored the hint" (catastrophic).

### 9.3 Per-tenant isolation

Buckets are keyed by tenant. A tenant who exhausts their Slack bucket cannot dilute another tenant's headroom. Across the cluster, the same tenant always lands on the same Redis shard via hash tags (`{tenant_id, source}`).

Per-tenant tier multipliers (premium tenants get higher caps) are a future feature; v1 uses one tier.

---

## 10. Failure isolation

### 10.1 What is isolated

- **Kafka partition affinity.** All `ingestion.*` topics partitioned by `tenant_id`. Noisy tenant queues up behind their partition; others' partitions process independently.
- **Per-tenant Redis token buckets.** A tenant who exhausts their bucket blocks only themselves.
- **DB connection pool per worker class.** Writer pool, embedding pool, planner pool are separate. A runaway in one cannot starve another.
- **Normalizer process-per-core.** A pathological payload from one tenant runs in one process; others continue.

### 10.2 What is not isolated, and why

- **Cross-tenant fairness on task queues.** Temporal task queues are FIFO. A tenant with 10,000 shards in flight can delay another tenant's first shard. This is acceptable for v1 because: (a) the per-tenant semaphore inside `SourceOnboardingWorkflow` prevents burst-scheduling, so the queue depth grows slowly; (b) measured impact is bounded by the rate limiter (only ~1 shard per `τ` seconds actually executes); (c) premium-tier per-tenant task queues are an additive feature when needed.
- **Postgres itself.** Per-tenant DB isolation requires either tenant-per-database (operationally heavy) or pgbouncer-level partitioning (not yet warranted). v1 relies on transaction-level fairness and bounded query sizes.

### 10.3 Hard caps to prevent DOS

A single tenant cannot DOS the system via observation count (rate limiter caps inbound rate), but they could via pathological observation content (giant JSONB, huge entity arrays). Hard caps:
- `content_text` ≤ 32 KB.
- `entities_mentioned` ≤ 256 entries.
- Raw payload ≤ 5 MB (S3-side limit, enforced at ingress).

Exceeding caps lands the payload in DLQ with `failure_kind='payload_too_large'`. Manual review.

---

## 11. The DLQ and recovery surface

### 11.1 What lands in DLQ

- Normalizer parse failures (handler `ValidationError`).
- Observation insert failures other than UNIQUE violations (UNIQUE is intentional dedup, not failure).
- Rate-limit-exhausted-beyond-retry-budget.
- S3 PutObject persistent failures.
- Kafka publish persistent failures.
- Fetcher terminal errors (4xx that the source documents as permanent).
- Reconciliation gaps unresolved after 2 passes.
- OAuth-revoked-mid-run.

Each row has: `tenant_id`, `source`, `failure_kind`, `raw_s3_key` (when applicable), `error_summary`, `attempt_count`, `first_seen_at`, `last_seen_at`, `resolved_at`, `resolution_kind`.

### 11.2 The replay tool

A one-shot CLI / Temporal workflow that reads `ingestion_failures WHERE resolved_at IS NULL`, fetches raw from S3, re-publishes to `ingestion.raw`. Idempotent: replayed envelopes flow through the same dedup-protected pipeline. Re-replaying a resolved failure is a no-op.

### 11.3 Pre-cutover recovery scripts

Several recovery scripts exist for one-shot pre-cutover data repair, not steady-state operation:

- **Embedding backlog backfill** — for pre-existing `embedding_pending=TRUE` rows. Reads directly from Postgres (not Kafka) at a configurable rate to avoid starving steady-state Ollama capacity.
- **Gmail orphan recovery (Case A)** — installs with zero mailbox watches. `_provision_install` is safe to re-run on these because `upsert_pending_watch`'s reset-to-pending is a no-op when no row exists.
- **Gmail partial-provisioning recovery (Case B)** — installs with some watches but not all. **Must NOT call `_provision_install`** (which would reset active watches to pending and overwrite `history_id`, losing messages in the gap). Instead, diffs inclusion-resolved emails against existing watches and `activate_watch`s only the missing ones.
- **NULL `thread_canonical_id` scanner** — repairs Gmail observations where the non-atomic UPDATE failed historically. Reads `content._gmail_thread_canonical_id`, UPDATEs the column.

These scripts exist because Phase 1 / Phase 2.1 verification surfaced the corresponding latent bugs in the current code. They are one-shot. The new outbox-driven world prevents the bugs from recurring; the scripts drain the pre-existing population.

---

## 12. The Bridge Layer contract

Bridge consumes a single Kafka topic: `onboarding.progress`. The contract is the topic shape; Bridge-side tables and revenue-at-risk computation are out of scope for this design.

Event types:
- `tenant.onboarding.started`
- `source.onboarding.started`
- `source.onboarding.feels_onboarded` (content-defined per §7)
- `shard.fetched`
- `source.onboarding.complete` (includes `coverage_confidence` per §13)
- `tenant.onboarding.complete`
- `tenant.onboarding.behind_schedule` (ops-only per §7.3)

Delivery semantics: at-least-once. Bridge consumers dedup on `(event_kind, tenant_id, source_if_applicable, shard_id_if_applicable)`. Bridge unavailability does not block the ingestion pipeline; the topic's 30-day retention buffers everything.

---

## 13. Reconciliation and coverage confidence

### 13.1 The reconciliation activity

At source-onboarding completion, the reconciler re-queries the source's authoritative count API per shard window and compares to the observation-side count. Gaps above the threshold (>0.1% AND >5 absolute messages) generate reconciliation shards with `parent_shard_id` set and boosted recency score so they run ahead of any remaining low-recency backfill.

Reconciliation runs at most twice. If gaps persist, the workflow completes with `status='partial'` and an `ingestion_failures` row documents the residual gap.

### 13.2 Per-source authoritative count APIs

- **Slack:** `conversations.history` paginated; sum counts.
- **GitHub:** `search/issues` `total_count` (cheap); `commits` paginated.
- **Gmail:** `users.messages.list` paginated.
- **Discord:** **no count API exists.**

### 13.3 Discord's weaker guarantee

Discord has no count endpoint and the message-ID snowflake is not a reliable gap detector (user/admin deletes create legitimate gaps). For Discord:

- **Gateway steady-state:** skip reconciliation. The Gateway is lossless within a held session; the failure mode reconciliation protects against (fetcher dropping pages mid-shard) is structurally rare on Gateway.
- **REST backfill:** **sparse 5% sampling.** Re-fetch a random 5% of completed channel-shards, compare counts, re-shard any with discrepancy.

This produces weaker coverage guarantees for Discord than for the other three sources. **This is documented and exposed via the `coverage_confidence` field on the `source.onboarding.complete` event:**

- `exact` — Slack/GitHub/Gmail with zero gap after reconciliation.
- `gap_reshared` — gap detected, resharded, post-reshare gap zero.
- `sparse_sampled_ok` — Discord-only: 5% sample showed no gaps.
- `sparse_sampled_gaps_found` — Discord-only: sample found gaps, resharded.
- `partial` — gaps persisted across 2 reconciliation passes.

The asymmetry is honest: Discord cannot give the same guarantee as the other sources because the source itself doesn't expose the data. The system surfaces this asymmetry rather than pretending uniformity.

---

## 14. Migration shape

### 14.1 Coexistence, not replacement

The migration is brownfield. The existing inline `ingest()` path stays operational throughout. The new Kafka path runs in parallel ("shadow mode") for at least 24 hours before cutover. The two paths produce identical observations (asserted by the shadow-read).

### 14.2 Per-tenant cutover

A `tenant_flags` flag (`ingestion.kafka_path_enabled`) selects the path per-tenant. Default false (inline). Cutover flips per tenant. Rollback flips back.

A circuit breaker (Temporal Schedule, every 60s) monitors normalizer consumer lag on `ingestion.raw`. If lag exceeds 60s for 5 consecutive minutes for any tenant, the breaker auto-flips that tenant's flag back to false. Inline ingestion resumes; the queued Kafka messages continue to drain through the normalizer pool. Bounded by the observation UNIQUE constraint, no double-ingestion.

The tenants whose messages are in the lagging Kafka partition are identified via a separate signal topic (`ingestion.tenant_traffic_signal`) at 1% deterministic-hash sampling. This avoids running a second consumer group on the production topic.

### 14.3 The cutover preconditions

A cutover for a tenant is permitted only when:

1. The new tables are migrated and the new code is deployed.
2. The OAuth callbacks have been refactored to write to the outbox in the same transaction as the install row (this is a per-provider refactor; ships incrementally).
3. The raw-tier + Kafka shadow path has been running for >24h with zero divergence from the inline path.
4. The staging dry-run of cutover and rollback has been executed and signed off.
5. The runbook documenting the four scenarios (clean rollback, partial rollback per-tenant, draining behavior, double-ingestion risk) exists.

Cutover is a per-tenant decision. New installs cut over first (no historical context to preserve). Existing tenants cut over individually after observation.

---

## 15. What this design deliberately excludes

The boundary of v1. Each exclusion has a reason.

| Excluded | Reason |
|---|---|
| Multi-region active-active | Single-region is well-understood. Cross-region adds Temporal namespace federation, Kafka MirrorMaker, S3 cross-region replication — none of which earn their operational tax until a regulatory data-residency requirement exists. |
| Schema registry (Avro/Protobuf) | Pydantic v2 in-repo is the schema. Kafka payloads are JSON. Evolution is additive-field-only enforced by code review. A registry adds an operated service for no current benefit. |
| Per-tenant Kafka clusters | Partition affinity provides sufficient isolation. Per-tenant clusters would cost thousands/month per tenant. |
| Per-tenant Temporal namespaces | Workflow IDs include `tenant_id`; Temporal serializes per-workflow-id natively. Namespaces are for cluster-layer tenancy (white-label sales scenario). |
| Custom application-layer backpressure protocol | Kafka consumer-group lag is the backpressure signal. When lag exceeds threshold, alert + auto-scale. Do not invent a NACK protocol. |
| Combining normalizer and writer | The GIL makes parsing CPU-bound; the INSERT is I/O-bound. Different scaling profiles. Mandated by §5.2. |
| Multi-shard Discord Gateway | Single shard suffices below 2,500 guilds. Sharding is a future feature, not a v1 design choice. |
| Slack edits/deletes/reactions ingestion | The current handler accepts `message` only. Adding event-type coverage is a parallel workstream independent of the substrate change. |
| GitHub event types beyond the existing 6 | Same reasoning. Independent of substrate. |
| Per-tenant KEK in secret store | Single MKEK + RLS is v1. Per-tenant KEK is a premium-tier feature for compliance-sensitive customers. |
| Backfill-during-disconnect-window | If a tenant uninstalls and reinstalls a week later, the gap in source-side data may not be recoverable. The system fetches what the source still retains; missing data is documented in the completion event, not fabricated. |

---

## 16. Open questions for the future

Not bugs, not omissions — known places where this design has deliberately stopped short.

- **Pgbouncer deployment mode** (sidecar-per-pod vs centralized service). Sidecar recommended for v1; revisit if connection counts grow.
- **Temporal Cloud vs self-hosted.** Cloud for v1 startup cost; revisit at scale-out.
- **Kafka partition counts.** 64 default; tune after measurement.
- **Normalizer pool auto-scale signal.** Scale-out on lag > 60s is specified; scale-in policy is "stay at peak count for 1 hour after lag drops below 10s, then scale down by 1 pod every 15 min" — recommendation, not yet validated.
- **Dual-mode writer code lifetime.** Mode B (low-latency) is opt-in pending the WS-dashboard product call. If the call comes back as "1-5s is acceptable for all tenants," Mode B is deleted within one release.
- **Reconciliation cadence for ongoing tenants.** Backfill-time reconciliation is specified; periodic post-backfill reconciliation (weekly?) is deferred to a Phase 5 maintenance loop.

---

## 17. How to use this document

When a new design choice arises:

1. **Check the five non-negotiables (§2).** If the choice violates one, the choice is wrong unless the non-negotiable itself is being explicitly retracted (which requires a versioned amendment to this document).
2. **Check the architectural shape (§3-5).** If the choice would put DB I/O in the normalizer, put workflow state on Kafka, or merge the control plane and data plane — it conflicts with the shape. Reconsider.
3. **Check the correctness contracts (§6).** If the choice could affect idempotency or the cursor-data ordering invariant — verify against the contracts here, not against intuition.
4. **Check exclusions (§15).** If the choice is in the excluded list, it's deliberately not v1. If it's *not* in the excluded list and feels like it should be — that's worth a conversation.

When the HLD/LLD/Implementation Plan documents disagree with each other:

1. Find the section here that addresses the disputed concern.
2. The document closer to this one's wording is correct.
3. The document farther from this one's wording must be updated to align.

When a verification round surfaces a new finding that this document doesn't address:

1. If it's a refinement (e.g., "the normalizer connection pool should use `statement_cache_size=0`"), it belongs in the LLD. This document stays at the principle level.
2. If it's a principle change (e.g., "we discovered we actually need per-tenant Kafka clusters"), this document gets a versioned amendment, *then* the LLD/HLD update to match.

This document is the slowest-moving of the five. That's deliberate.

---

**End of canonical system design.**

Cross-references:
- Current state: `01-current-state.md`
- High-level design: `02-high-level-design.md` (v2.1)
- Low-level design: `03-low-level-design.md` (Phase 3.1)
- Implementation plan: `04-implementation-plan.md` (TBD)
