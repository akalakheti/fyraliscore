# Fyralis Core Architecture

Last reviewed from the codebase on 2026-05-18.

Fyralis Core is an organizational intelligence runtime. It ingests company signals, stores them as tenant-scoped observations, reasons over them into a live model of the organization, and renders the result into CEO-facing product surfaces.

The repository is intentionally a monolith at the source level: the FastAPI gateway, domain services, workers, migrations, simulation tooling, and React UI live together. Operationally, the system is split into a gateway process, a small set of polling/background workers, PostgreSQL with pgvector, Ollama for embeddings, external LLM providers for reasoning/rendering, and a Vite/React frontend.

## 1. System Map

```text
React/Vite UI (:5173 in dev)
  /today, /model, /forecasts, /ledger, /debug
        |
        | HTTP /api/*, WS /stream/*
        v
FastAPI gateway (:8000)
  auth, rate limits, ingest, CEO view, query, rendering,
  demo sessions, today/model/spec routes, history, forecasts,
  recommendations, conversations, debug, simulation
        |
        | asyncpg
        v
PostgreSQL 16 + pgvector
  observations, models, acts, resources, queues, cache,
  audit/reconciliation/topology/demo/prediction tables
        |
        +--> Ollama /api/embeddings (nomic-embed-text, 768 dimensions)
        +--> LLM providers (Anthropic/OpenAI/DeepSeek)

Background execution:
  ThinkWorker              drains think_trigger_queue and model_reeval_queue
  PostCommitWorker         drains pending_post_commit_actions
  Gateway scheduler        refreshes view_ceo_cache and pushes WS events
  Additional worker modules exist for anomaly, entity, calibration,
                            deadline, precipitation, topology, maintenance
```

The core path is:

```text
source event
  -> ingestion handler
  -> observations row
  -> think_trigger_queue row
  -> Think retrieval + reasoning + validation
  -> diff application to Models / Acts / Resources
  -> audit, reconciliation, cascades, post-commit queue
  -> cached/rendered CEO views and UI routes
```

## 2. Runtime Components

| Component | Code | Responsibility |
|---|---|---|
| Gateway | [services/gateway/main.py](services/gateway/main.py) | Main FastAPI app, dependency lifecycle, middleware, core routes, router mounting. |
| UI | [ui/src/main.tsx](ui/src/main.tsx) | React Router app for `/today`, `/model`, `/forecasts`, `/ledger`, `/debug`. |
| Database | [db/migrations](db/migrations) | Schema for substrate data, queues, cache, demo, topology, predictions, RLS policies. |
| Embeddings | [lib/embeddings](lib/embeddings) | Ollama/OpenAI embedder abstraction. Current schemas expect 768-dimensional vectors. |
| LLM | [lib/llm/provider.py](lib/llm/provider.py) | Structured-output provider abstraction over Anthropic, OpenAI, and DeepSeek, with retry and cost tracking. |
| Think worker | [services/think/worker.py](services/think/worker.py) | Polls reasoning queues and invokes the `think()` pipeline. |
| Post-commit worker | [services/think/post_commit.py](services/think/post_commit.py) | Durable at-least-once side effects after reasoning commits. |
| Rendering | [services/rendering](services/rendering) | LLM-backed UI prose generation with voice-rule checks and render cost records. |
| CEO view cache | [services/greeting](services/greeting) | Snapshot composition, cache writes, `/view/ceo/home`, and WS streaming. |
| Demo subsystem | [services/demo](services/demo) | Demo companies, per-session tenants, snapshots, auth tokens, simulator, SSE. |

Local/prod compose currently defines `postgres`, `ollama`, `gateway`, `think_worker`, `post_commit_worker`, `ui`, `nginx-proxy`, and `acme-companion` in [docker-compose.yml](docker-compose.yml). Several worker packages are implemented but are not first-class compose services yet.

## 3. Cross-Cutting Conventions

**Tenant boundary.** Almost every persisted domain row carries `tenant_id`. Gateway auth resolves bearer tokens into an actor and tenant, then request handlers use that tenant in queries. Later migrations add tenant FKs and permissive RLS defaults, but application-level tenant scoping is still the main runtime discipline.

**Identifiers.** Backend-generated IDs use `uuid7()` from [lib/shared/ids.py](lib/shared/ids.py) for time-ordered UUIDs. Demo/session/token code may use database UUID generation in SQL in a few adapter paths.

**Database access.** Python services use `asyncpg` pools and repositories. Tests generally run against real PostgreSQL, not an in-memory fake. The gateway pool registers codecs for JSON/vector compatibility via [services/gateway/db_bootstrap.py](services/gateway/db_bootstrap.py).

**Vectors.** `observations`, `models`, and `entity_aliases` store `VECTOR(768)`. Ollama's `nomic-embed-text` is the default local backend; [lib/embeddings/factory.py](lib/embeddings/factory.py) can choose OpenAI when configured.

**Structured LLM calls.** Reasoning and rendering ask providers for Pydantic-shaped outputs through [lib/llm/provider.py](lib/llm/provider.py). `.env.example` sets DeepSeek as the local default; the provider library itself falls back to Anthropic if no provider env is set.

**Observability records.** Runtime state is heavily persisted: `think_runs`, `think_run_costs`, `think_run_artifacts`, `view_render_costs`, `audit_events`, `reconciliation_events`, `relationship_maintenance_log`, and debug routes all exist to make reasoning inspectable.

## 4. Data Model

The database schema starts in [0001_foundation.sql](db/migrations/0001_foundation.sql) and is extended through migration `0042`.

### Foundation Tables

| Area | Tables | Notes |
|---|---|---|
| Actors | `actors`, `actor_identity_mappings`, `actor_sessions` | People/agents, source identity mapping, bearer-session auth. |
| Observations | `observations` | Append-oriented signals, partitioned by `occurred_at`, indexed by actor/channel/kind/entities/vector. |
| Models | `models`, `model_status_notes`, `model_signal_readings` | Beliefs/propositions with confidence, activation, falsifiers, signal readings, lifecycle, and vector search. |
| Acts | `goals`, `commitments`, `decisions`, `commitment_contributors` | Executable organizational state. State machines live under [services/acts](services/acts). |
| Act graph | `contributes_to`, `depends_on`, `constrained_by` | Relationships among goals, commitments, and decisions. |
| Resources | `resources`, `resource_transactions`, `resource_deployments`, `customer_commitments` | Assets, transactions, deployments, and customer/revenue bridge data. |
| Entity aliases | `entity_aliases` | Fast-path entity resolution by alias text/vector. |

### Reasoning and View Tables

| Area | Tables | Purpose |
|---|---|---|
| Queues | `think_trigger_queue`, `model_reeval_queue`, `pending_post_commit_actions`, `topo_dirty_queue` | Durable work queues polled with `FOR UPDATE SKIP LOCKED`. |
| Idempotency | `applied_triggers`, `dedup_keys_seen` | Prevent duplicate application of the same trigger/diff. |
| Think observability | `think_runs`, `think_run_costs`, `think_run_artifacts`, `think_anomalies_raw` | Run status, cost, debug capture, anomaly staging. |
| Reconciliation/audit | `reconciliation_events`, `audit_events` | Duplicate-model decisions and model state-change chain. |
| CEO view | `view_ceo_cache`, `view_render_costs`, `viewer_state`, `card_conversations`, `card_exchanges` | Cached product payloads, render costs, per-viewer last-seen state, card probes. |
| Recommendations | `model_watchers`; recommendation columns on `models`; `decision_deltas` and evidence | Recommendation workflow and Today review surface. |
| Forecasts | `predictions`, `prediction_signals`, calibration tables | Forecast creation, resolution, and hit-rate/cost views. |
| Demo | `tenants`, `demo_configs`, `demo_sessions`, `demo_session_costs` | Per-demo tenant provisioning and cost/session accounting. |
| Topology | `model_edges`, `model_neighborhoods`, `model_neighborhood_membership`, `topology_events` | Typed model graph, topology embeddings, neighborhoods, phase events. |

## 5. Gateway Architecture

[services/gateway/main.py](services/gateway/main.py) is the main process entry point.

Startup through `build_app()`:

1. Configures structlog.
2. Creates or accepts an asyncpg pool.
3. Ensures demo seed config exists.
4. Constructs `ActorRepo`, `EntityAliasRepo`, an optional Ollama client, and `RateLimiter`.
5. Starts the realtime dispatcher.
6. Wires the CEO-view stack when `GATEWAY_CEO_VIEW_ENABLED != 0`.
7. Optionally starts the greeting scheduler.
8. Closes owned resources on lifespan shutdown.

Middleware order:

| Middleware | Role |
|---|---|
| `RequestContextMiddleware` | Creates request IDs, binds tenant/actor context for logs, emits access summaries. |
| `BearerAuthMiddleware` | Validates bearer tokens against `actor_sessions`; injects auth context and sometimes `X-Tenant-Id` for CEO/demo routes. |
| `RateLimitMiddleware` | Per-tenant/actor token-bucket limiting. |

Important public or auth-bypassed route families include `/healthz`, `/auth/session`, `/view/ceo/*`, `/rendering/*`, `/simulation/*`, `/debug/*` in dev/test, and the public demo picker/session-start endpoints.

### Mounted Route Families

| Routes | Owner | Notes |
|---|---|---|
| `/ingest/{channel}` | gateway + ingestion | Uniform signal ingestion path. |
| `/observations`, `/models`, `/commitments`, `/goals`, `/decisions`, `/resources` | gateway | Basic substrate list/read surfaces. |
| `/dashboard/*`, `/v1/structure/*`, `/v1/recommendations/*`, `/v1/artifacts/*` | gateway | Product/data adapter endpoints. |
| `/rendering/*` | rendering router | In-process rendering service mounted into gateway. |
| `/view/ceo/home`, `/view/ceo/force-refresh` | greeting router | Cached CEO view. |
| `/view/ceo/ask`, turn actions | query router | Ask/query orchestration through retrieval + rendering. |
| `/v1/cards/{id}/conversation`, `/probe` | conversations | Card-scoped follow-up probes. |
| `/v1/demo/*`, `/v1/recommendations/stream` | demo | Demo lifecycle, simulator, SSE. |
| `/v1/decision-deltas/*`, `/today/*` | decision delta / today routes | Today v2 proposed-change workflow. |
| `/model/*`, `/map/*`, `/v1/model/*` | model/map/model trace | Model page, topology/map, trace. |
| `/v1/history`, `/v1/forecasts/*`, spec routes | history/forecast/spec routers | Ledger/forecast/spec surfaces. |
| `/debug/*` | debug router | Dev/test read-only inspector for raw runtime state. |

## 6. Ingestion Path

The ingestion implementation lives in [services/ingestion/core.py](services/ingestion/core.py). It normalizes all channels into an `ObservationDraft` and persists an observation.

Flow:

1. Gateway receives `POST /ingest/{channel}` and verifies channel-specific requirements such as Slack signatures.
2. `get_handler(channel)` returns a handler from [services/ingestion/handlers](services/ingestion/handlers).
3. The handler emits `ObservationDraft`: source channel, content text, raw JSON content, actor ref, external ID, occurred time, trust tier, entity hints, and kind.
4. Ingestion pre-assigns an observation UUID.
5. `ActorRepo` maps source actor refs to actor IDs when possible.
6. `EntityAliasRepo` performs fast-path entity lookup from 1-3 gram candidate phrases.
7. The embedder generates a 768-dimensional vector. Failures store `embedding_pending=True`.
8. `ObservationRepository.insert()` writes to the partitioned `observations` table and dedups on source channel/external ID behavior.
9. A T1 `think_trigger_queue` row is written unless the observation was deduped or trigger enqueueing was disabled.
10. Post-commit observation notifications are emitted for downstream workers/listeners.

The trust map is centralized in [services/ingestion/handlers/__init__.py](services/ingestion/handlers/__init__.py). Handler files exist for Slack, system/internal, email, GitHub, Linear, calendar, and related channels; confirm import/registration behavior when adding a new production channel.

## 7. Think Pipeline

The core reasoning entry point is [services/think/reason.py](services/think/reason.py). The queue runner is [services/think/worker.py](services/think/worker.py).

### Trigger Kinds

| Kind | Typical source | Meaning |
|---|---|---|
| T1 | Ingestion | A new signal arrived. |
| T2 | Prediction/belief updates | A prediction or belief needs reevaluation. |
| T3 | Anomaly processor | An anomalous region needs reasoning. |
| T4 | Background/pattern work | Maintenance or precipitation-driven reasoning. |
| T6 | Topology events | Neighborhood/graph phase shifts. |

`ThinkWorker` polls `think_trigger_queue`, promotes pending `model_reeval_queue` rows to T4 triggers, applies per-tenant concurrency caps, backs off under queue pressure, and marks failed rows after retry exhaustion.

### Retrieval

Primary retrieval is in [services/retrieval/primary.py](services/retrieval/primary.py).

Pathways:

| Pathway | Role |
|---|---|
| A structural | Scope/entity/model graph overlap. |
| B semantic | Vector similarity against seed text. |
| C temporal | Recent relevant context. |
| D pattern | Pattern/background retrieval. |
| F topological | Topology embedding and neighborhood context. |

Trigger-specific weights combine pathway outputs. Results are merged/ranked, then `ModelsRepo.retrieve()` reconsolidates returned models by increasing retrieval count/activation and updating `last_retrieved_at`.

[services/retrieval/assembler.py](services/retrieval/assembler.py) compresses retrieval results into a bounded context bundle: observations, models, acts, resources, and bridge context. It includes access-control stubs and MMR selection for model diversity under a token budget.

### Reason, Validate, Apply

The Think transaction performs:

1. Insert/update a `think_runs` record.
2. Retrieve and assemble context.
3. Route authoritative/deterministic cases to deterministic handlers; otherwise call the configured LLM through `llm_reason`.
4. Validate the raw diff against [services/think/diff_schema.py](services/think/diff_schema.py) and semantic rules in `validator.py`.
5. Acquire advisory region locks based on touched tenant/entities.
6. Reconcile model inserts against existing models before applying.
7. Apply claim ops, act ops, and resource ops with [services/think/applier.py](services/think/applier.py).
8. Emit state-change observations, audit events, cascades, and reeval triggers.
9. Enqueue durable post-commit actions.
10. Record LLM cost and run status.

Diffs mutate three surfaces:

| Diff bucket | Target |
|---|---|
| `claim_ops` | Models: insert, update, archive, relocate. |
| `act_ops` | Goals, commitments, decisions, and act graph edges. |
| `resource_ops` | Resources, transactions, deployments, releases. |

Application is idempotent through `applied_triggers`. A duplicate trigger short-circuits rather than re-running side effects.

## 8. Models, Reconciliation, Audit, and Topology

[services/models/repo.py](services/models/repo.py) is the main Models repository. Inserts validate proposition shape, falsifier adequacy above confidence thresholds, scope actor existence, confidence clipping, embeddings, recommendation shape, state-change emission, audit events, typed edges, and topology dirty-queue updates.

Key model-side concepts:

| Concept | Code/schema | Purpose |
|---|---|---|
| Proposition kind | generated from `models.proposition` | Type-level discriminator for state, concern, prediction, recommendation, etc. |
| Confidence | model column + calibration modules | Main strength/credence signal. |
| Activation | model column | Recency/importance signal raised by retrieval and decayed by maintenance. |
| Falsifier | [services/models/falsifier.py](services/models/falsifier.py) | Required for strong claims and recommendations. |
| Signal readings | `model_signal_readings` sidecar | Per-signal evidence contributions. |
| Typed edges | `model_edges` + [services/models/edges_repo.py](services/models/edges_repo.py) | First-class model graph replacing older array-only relationships. |
| Topology | [lib/topology](lib/topology), [services/topology](services/topology) | Positional embeddings, neighborhoods, topology events, UMAP projection. |

Reconciliation is first-class in [services/think/reconciler.py](services/think/reconciler.py). Insert claim ops are checked against existing models; decisions are recorded in `reconciliation_events`. Auto-merge decisions convert inserts into updates. Human-review/no-match decisions preserve auditability and avoid silent destructive merges.

Audit events in `audit_events` record model changes, reversals, and reconciliation merge chains. This is the main answer to "why did this belief change?"

## 9. CEO View, Rendering, Query, and Conversations

The CEO-facing product surface is composed from cached backend state rather than issuing a fresh LLM render on every page load.

### Greeting/CEO Cache

[services/greeting/scheduler.py](services/greeting/scheduler.py) keeps `view_ceo_cache` fresh for registered tenants.

Refresh triggers include scheduled intervals, time-of-day boundaries, Postgres `LISTEN view_ceo_refresh`, and polling of post-commit actions as a fallback. The scheduler composes substrate snapshots via [services/greeting/snapshot.py](services/greeting/snapshot.py), sends render requests, writes cache keys, and publishes WebSocket updates.

Cache keys:

| Key | Meaning |
|---|---|
| `greeting` | Opening summary. |
| `query_grid` | Suggested questions. |
| `cards` | CEO-relevant cards. |
| `status` | Health/calibration/needs-you summary. |
| `close_line` | Closing summary line. |

[services/greeting/api.py](services/greeting/api.py) assembles these into `GET /view/ceo/home`. [services/greeting/stream.py](services/greeting/stream.py) exposes WS streaming.

### Rendering

[services/rendering/core.py](services/rendering/core.py) builds prompts for greetings, cards, query chips, card reasoning, and conversation turns. It calls the LLM provider, runs voice-rule checks, retries once on reject-level violations, and writes `view_render_costs` when a pool is configured.

### Query

[services/query/core.py](services/query/core.py) powers Ask flows:

```text
query
  -> classifier
  -> strategy
  -> retrieval + context assembly
  -> rendering adapter
  -> AnswerQueryResponse with retrieval trace and cost
```

Strategies live in [services/query/strategies](services/query/strategies). The gateway wires query routes during CEO-view setup and shares the gateway embedder so semantic retrieval works for `/view/ceo/ask`.

### Conversations

[services/conversations](services/conversations) stores and handles card-scoped probe threads. The Today UI can ask follow-up questions against a specific card without losing card context.

## 10. UI Architecture

The frontend is a Vite + React + TypeScript app in [ui](ui).

Routes in [ui/src/main.tsx](ui/src/main.tsx):

| Route | Page | Backend surface |
|---|---|---|
| `/today` | Today briefing/review | `/today`, decision deltas, card probes, ask, streams. |
| `/model` | Model page v2 | `/model/*`, `/v1/model/*`, map/topology APIs. |
| `/forecasts` | Forecasts spec page | `/v1/forecasts/*`. |
| `/ledger` | Ledger/history spec page | `/v1/history`, spec/ledger APIs. |
| `/debug/*` | Debug inspector | `/debug/*`, dev/test only. |

Legacy routes redirect into the current four-product-surface model: `/structure` and `/map` redirect to `/model`; `/history` redirects to `/ledger`; `/mind`, `/demo`, `/ask` redirect to `/today`.

API clients live under [ui/src/api](ui/src/api). The Vite dev server proxies `/api/*` to gateway `http://localhost:8000` and `/stream/*` to gateway WebSockets unless `USE_MOCK=1`, in which case [ui/mock-server.ts](ui/mock-server.ts) and fixture data serve the app locally.

The UI has a demo-session wrapper, [ui/src/shell/AutoDemoSession.tsx](ui/src/shell/AutoDemoSession.tsx), that provisions or reuses demo auth tokens in local/demo flows. Tokens are stored in local storage and sent as bearer auth by shared API helpers.

## 11. Demo and Simulation

The demo system lets anonymous visitors choose a company, provision a fresh tenant, and interact with realistic seeded data.

Flow:

1. `GET /v1/demo/companies` lists configured companies.
2. `POST /v1/demo/sessions/start` creates a new tenant, loads a snapshot, finds/mints the CEO actor, creates an `actor_sessions` token, and returns session metadata.
3. Authenticated demo calls use that token and tenant.
4. Reset/end endpoints manage session lifecycle.
5. Simulator endpoints inject signals and increment demo counters.
6. `/v1/recommendations/stream` streams recommendation/demo events.

Implementation lives in [services/demo/router.py](services/demo/router.py), [services/demo/sessions.py](services/demo/sessions.py), and [services/demo/snapshot.py](services/demo/snapshot.py). Demo model routing in [services/demo/model_routing.py](services/demo/model_routing.py) can choose cheaper/faster models per tenant/call kind.

The gateway can also mount simulation helpers and static Slack UI from [simulation](simulation) when `GATEWAY_MOUNT_SIM=1`.

## 12. Background Workers

### Deployed by Compose

| Worker | Launcher | Behavior |
|---|---|---|
| Think | [scripts/run_think_worker.py](scripts/run_think_worker.py) | Creates pool/provider and runs `ThinkWorker.run()`. |
| Post-commit | [scripts/run_post_commit_worker.py](scripts/run_post_commit_worker.py) | Polls `pending_post_commit_actions`, dispatches handlers, retries with backoff, dead-letters after max attempts. |

### In-Process in Gateway

| Worker | Code | Behavior |
|---|---|---|
| Realtime dispatcher | [services/realtime](services/realtime) | WebSocket dispatch/replay machinery. |
| Greeting scheduler | [services/greeting/scheduler.py](services/greeting/scheduler.py) | Scheduled and trigger-driven cache refresh. |

### Implemented Worker Modules

Additional worker packages exist under [services/workers](services/workers):

| Package | Purpose |
|---|---|
| `anomaly_processor` | Detects and stages anomalies. |
| `entity_resolver` | Resolves unresolved actors/entities from observations. |
| `calibration_updater` | Computes calibration/hit-rate updates. |
| `deadline_resolver` | Resolves due predictions/deadlines. |
| `precipitation` | Clusters candidate patterns and proposes background reasoning. |
| `edge_drift` | Checks typed model edges against legacy relationship arrays. |
| `topology_updater` | Processes topology dirty queue and cascades positional updates. |
| `neighborhood_detector` | Detects graph neighborhoods and topology phase events. |
| `maintenance` | Daily/weekly/monthly maintenance routines. |

Treat these as available architecture modules, not all as currently deployed services.

## 13. Security and Access Control

Authentication is bearer-token based through `actor_sessions` and [services/gateway/auth.py](services/gateway/auth.py). `/auth/session` can mint sessions, optionally guarded by `AUTH_BOOTSTRAP_SECRET`.

Authorization layers:

| Layer | Current implementation |
|---|---|
| Gateway auth | Bearer token -> `AuthContext(actor_id, tenant_id, expires_at)`. |
| Rate limiting | Per actor/tenant token buckets. |
| Request tenant scoping | Request handlers use tenant from auth/header/default env. |
| Access-control services | [services/access_control](services/access_control) contains role hierarchy, materialized visibility, checks, audit. |
| RLS | Later migrations enable permissive tenant policies on many tables. |
| Debug routes | Mounted only for `dev`, `staging`, or `test` environment names. |

The current dogfood/demo configuration has deliberate dev shortcuts: default tenant fallback, static CEO tokens, unauthenticated demo picker/session-start, and optional simulation/debug mounts. Shared or production deployments should review those env flags carefully.

## 14. Deployment and Local Development

Local setup is described in [README.md](README.md).

Important env groups:

| Group | Examples |
|---|---|
| Database/embedding | `DATABASE_URL`, `OLLAMA_URL`, `OLLAMA_EMBED_MODEL`. |
| LLM | `LLM_PROVIDER`, `LLM_MODEL`, provider API keys, timeouts. |
| Tenant identity | `DEFAULT_TENANT_ID`, `COMPANY_OS_CEO_ACTOR_ID`, `DEV_BEARER_TOKEN`, `VIEW_CEO_TOKEN`. |
| Gateway | `COMPANY_OS_ENV`, `GATEWAY_OWNS_POOL`, `GATEWAY_CEO_VIEW_ENABLED`, `GATEWAY_START_GRT_SCHEDULER`, `GATEWAY_MOUNT_SIM`. |
| Workers | `THINK_*`, `POST_COMMIT_WORKER_POLL_INTERVAL_S`, `GREETING_REFRESH_INTERVAL_SECONDS`. |
| Debug | `DEBUG_ARTIFACT_CAPTURE`, `LOG_LEVEL`. |

The production-ish compose topology builds the Python gateway image from [Dockerfile](Dockerfile) and the UI from `Dockerfile.ui`, fronts the UI with nginx-proxy/acme, and expects `.env.production` for secrets.

## 15. Testing Strategy

Python tests are mostly real integration tests:

```bash
pytest
pytest -m integration
pytest -m ollama
RUN_REAL_LLM=1 pytest -m real_llm
```

The suite is organized by service package (`services/*/tests`) plus cross-service tests under [tests](tests). `pyproject.toml` configures pytest, strict markers, async mode, and warning filters.

UI tests:

```bash
cd ui
npm test
npm run test:e2e
npm run typecheck
```

Playwright E2E uses the in-repo mock backend. The UI can be developed against either gateway proxy mode or `USE_MOCK=1` mode.

## 16. How to Extend the System

### Add a New Ingestion Channel

1. Add a handler in [services/ingestion/handlers](services/ingestion/handlers).
2. Register it with `@register("channel:name")`.
3. Add the channel trust tier to `CHANNEL_TRUST_MAP`.
4. Ensure the handler module is imported so registration runs.
5. Add ingestion and gateway tests.
6. Decide whether the payload needs signature/auth verification in gateway.

### Add a New Model Proposition Kind

1. Update proposition validation in [services/models/propositions.py](services/models/propositions.py).
2. Add migration/check constraints if needed.
3. Update prompts, `diff_schema`, validator/applier logic if the LLM can emit it.
4. Add retrieval/rendering behavior if it should appear in UI context.
5. Add tests for insert, validation, retrieval, and rendering.

### Add a New UI Surface

1. Add route in [ui/src/main.tsx](ui/src/main.tsx).
2. Add API client/types in [ui/src/api](ui/src/api).
3. Prefer a gateway adapter route over direct table-shaped UI coupling.
4. Add mock fixture support for `USE_MOCK=1`.
5. Add Vitest and, if user-facing flow matters, Playwright coverage.

### Add a New Worker

1. Keep core work idempotent and safe under multiple worker instances.
2. Use Postgres queues or clear cursor state.
3. Prefer `FOR UPDATE SKIP LOCKED` for durable queue drains.
4. Record observability rows or logs for every meaningful mutation.
5. Add a launcher script and compose service only when it should run by default.

## 17. Architectural Risks and Active Edges

| Risk | Why it matters | Where to look |
|---|---|---|
| Gateway is large | Many product adapters and legacy routes live in one file, increasing coupling. | [services/gateway/main.py](services/gateway/main.py), route modules under [services/gateway](services/gateway). |
| Worker deployment gap | More worker modules exist than are launched by compose. | [services/workers](services/workers), [docker-compose.yml](docker-compose.yml). |
| Dev auth shortcuts | Static tokens/default tenant are convenient but easy to misconfigure in shared envs. | `.env.example`, gateway public path config. |
| Handler registration drift | Handler files and trust map can diverge from imported registered handlers. | [services/ingestion/handlers/__init__.py](services/ingestion/handlers/__init__.py). |
| Spec references are historical | Many docstrings reference older `ARCHITECTURE-FINAL.md`, `SCHEMA-LOCK.md`, and `CONTRACTS.md` files not present in this checkout. | Code and migrations are the effective source of truth. |
| Mixed old/new UI API surfaces | `/view/ceo/*`, `/today/*`, `/model/*`, spec routes, and legacy redirects coexist. | [ui/src/main.tsx](ui/src/main.tsx), [services/gateway](services/gateway). |
| RLS vs app-level tenancy | RLS policies exist, but most correctness still depends on passing tenant IDs through app code. | migrations `0036`-`0041`, repositories. |

## 18. Source of Truth

When code and docs disagree, prefer this order:

1. Database migrations in [db/migrations](db/migrations).
2. Repository/service implementations under [services](services) and [lib](lib).
3. Route wiring in [services/gateway/main.py](services/gateway/main.py) and [ui/src/main.tsx](ui/src/main.tsx).
4. Tests under [services](services), [tests](tests), and [ui/src/tests](ui/src/tests).
5. Design documents such as this one.

This document is a map, not a lockfile. Update it when new routes, queues, worker deployments, schema families, or UI surfaces become first-class.
