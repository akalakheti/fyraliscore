# Implementation Plan: GitHub Production Integration (IN-13)

**Branch**: `feat/IN-13-github-integration` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: [specs/IN-13-github-integration/spec.md](./spec.md)

## Summary

Self-serve GitHub App install + production-grade webhook ingest. Adds a new `services/integrations/github/` package (oauth, client, uninstall, metrics), wires `/integrations/github/{install,callback}` routes onto the existing integrations router, extends `services/webhooks/router.py` with three GitHub-specific branches (replay-cache check, lifecycle dispatch, repo-filter), and adds a single ALTER TABLE migration `0042_provider_installations_selected_repositories.sql`. Webhook signature verification is App-level (per Clarifications Q1 — GitHub Apps do not support per-installation secrets); per-tenant isolation is enforced by the existing `services/webhooks/tenant_resolver.py::_extract_github` resolving `installation.id` → `tenant_id`. The existing per-event shapers in `services/ingestion/handlers/github.py` (`pull_request`, `push`, `issues`, `issue_comment`, `pull_request_review`, `check_run`) are reused unchanged.

## Technical Context

**Language/Version**: Python 3.12 (matches the existing gateway runtime; see `pyproject.toml`)
**Primary Dependencies**: FastAPI (existing gateway), asyncpg (DB), httpx (outbound HTTP — already vendored for Slack/Discord clients), `PyJWT[crypto]` or `cryptography` (RSA + JWT signing — verify availability and add to `pyproject.toml` if absent), structlog (logging), existing `services/webhooks/*` modules.
**Storage**: Postgres via asyncpg pool already on `request.app.state.pool`. New column `provider_installations.selected_repositories JSONB NULL` added by migration 0042. Encrypted secret store (`encrypted_secrets`) used for the App-level webhook secret.
**Testing**: pytest with asyncio. Existing webhook test infrastructure in `services/webhooks/tests/` provides the harness shape — `test_verifier_github.py` is the precedent for verifier tests; new integration tests live in `services/integrations/github/tests/` and `services/webhooks/tests/test_router_github.py`.
**Target Platform**: Linux server (single-deployment FastAPI gateway behind a TLS-terminating proxy).
**Project Type**: Web service (modular monolith — single FastAPI app with package-level isolation per integration).
**Performance Goals**: GitHub's documented webhook timeout is 10 seconds; we target end-to-end p95 < 1 second from receive to 200-OK, with ingestion + replay-cache write inside the request and post-commit work fanning out to the existing `post_commit_worker`. Install token mint p99 < 1s on warm cache, < 2s cold (single round-trip to GitHub).
**Constraints**: Multi-tenant; structural tenant isolation (Constitution §III) MUST hold; zero modifications to Slack/Discord packages; one new column maximum on `provider_installations`; no new tables.
**Scale/Scope**: O(100) tenants × O(10) repos per tenant = O(1000) installations. O(1000) webhook deliveries/hour in steady-state. Replay cache LRU sized at 4096 entries / 5-minute TTL is well above the per-window delivery rate.

## Constitution Check

Re-checked after Phase 1 design. All clauses pass.

### I. Four Foundations Are Epistemically Distinct ✅
- This feature does NOT introduce a fifth foundation. `provider_installations` is a per-feature side table for cross-cutting tenant routing.
- Webhook events flow `input → Observation → Think → Model/Act` per the universal flow rule. The existing handler at `services/ingestion/handlers/github.py` produces `ObservationDraft` only — no Models, Acts, or Resources are created in this feature.

### II. Schema Is Append-Only, Migrations Are Idempotent ✅
- Migration `db/migrations/0042_provider_installations_selected_repositories.sql` adds one nullable JSONB column via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`. Idempotent. No destructive changes.
- Migration runs in its own transaction (per the standard `BEGIN/COMMIT` wrapping used by other IN-* migrations).

### III. Tenant Isolation Is Structural, Not Procedural ✅
- No new tenant-scoped table. The existing `provider_installations` already carries `tenant_id NOT NULL`, FK + DEFERRABLE INITIALLY IMMEDIATE, RLS + FORCE, and `tenant_isolation` policy (migration 0039). Adding one JSONB column does not require restating those three layers.
- The webhook router's resolved `tenant_id` is used to scope ingestion (existing behavior — unchanged).

### IV. Secrets Are Envelope-Encrypted ✅ (with documented protocol exception)
- The App-level webhook secret is the GitHub-protocol-mandated artifact (Clarifications Q1). It is stored in `encrypted_secrets` as a single shared entry with `tenant_id=NULL` semantically (resolved via `load_secrets(..., tenant_id=None, …)`). This is consistent with how the existing `services/webhooks/secrets.py` already handles platform-wide secrets.
- The App private key is in env var per Clarifications Q3 (matching the v1 posture for other deployment-wide secrets).

### V. Idempotency Everywhere ✅
- Observation dedup: existing `(source_channel, external_id)` unique index.
- Replay cache: `(installation_id, X-GitHub-Delivery)` keyed; in-process LRU; not a correctness gate.
- Installation row UPSERT: existing `provider_installations.UNIQUE(provider, installation_id)` guarantees idempotent install / re-install.
- Uninstall chokepoint: shared `_disable_github_installation` function with idempotent UPDATE.

### VI. Observability Without Cardinality Blowup ✅
- All metrics use low-cardinality labels (Clarifications Q5). Per-installation drill-down via structured log fields.

## Project Structure

### Documentation (this feature)

```text
specs/IN-13-github-integration/
├── plan.md                                          # This file
├── spec.md                                          # Feature spec (clarified)
├── research.md                                      # Phase 0 output
├── data-model.md                                    # Phase 1 output
├── quickstart.md                                    # Phase 1 output (smoke-test runbook)
├── contracts/
│   ├── http-integrations-github.md                  # /integrations/github/* contract
│   ├── http-webhooks-github.md                      # /webhooks/github/events contract additions
│   └── module-github-client.md                      # outbound GitHub REST client surface
├── checklists/
│   └── requirements.md                              # Spec quality checklist (passing)
└── tasks.md                                         # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
services/integrations/github/
├── __init__.py                                      # NEW: package marker
├── oauth.py                                         # NEW: install_handler + callback_handler
├── client.py                                        # NEW: outbound REST + JWT mint + token cache + uninstall chokepoint
├── uninstall.py                                     # NEW: shared _disable_github_installation + lifecycle webhook handlers
├── metrics.py                                       # NEW: counter declarations
└── tests/
    ├── conftest.py                                  # NEW: fixtures (mocked GitHub API, ephemeral App private key)
    ├── test_oauth_install.py                        # NEW
    ├── test_oauth_callback.py                       # NEW
    ├── test_client_jwt.py                           # NEW
    ├── test_client_token_cache.py                   # NEW
    ├── test_uninstall_inbound.py                    # NEW
    ├── test_uninstall_outbound_chokepoint.py        # NEW
    └── test_install_collision.py                    # NEW

services/integrations/router.py                      # MODIFIED: +4 lines mounting /integrations/github/{install,callback}
services/webhooks/router.py                          # MODIFIED: replay-cache check, GitHub lifecycle dispatch, repo-filter
services/webhooks/replay_cache.py                    # NEW: in-process LRU (separate module so tests can construct one)
services/webhooks/tests/test_router_github.py        # NEW: end-to-end inbound delivery
services/webhooks/tests/test_replay_cache.py        # NEW: LRU + TTL unit tests

db/migrations/0042_provider_installations_selected_repositories.sql   # NEW

tests/integration/test_github_install_e2e.py         # NEW: synthetic install-against-mock harness
tests/integration/test_github_webhook_e2e.py         # NEW: signed delivery → observation
tests/integration/test_github_install_collision.py   # NEW: cross-tenant rebind
tests/integration/test_github_client_token.py        # NEW: token-mint performance harness
```

**Structure Decision**: All new code lives under `services/integrations/github/` and a few minimal additions in `services/webhooks/` (replay cache module, router additions, tests). The existing `services/ingestion/handlers/github.py` is unchanged. The integrations router is amended with four lines mounting two new routes. The database gets exactly one new nullable column.

## Phase 0: Research

See [research.md](./research.md). Key decisions:

- **JWT library**: `PyJWT[crypto]` with `algorithm="RS256"`. If not already in `pyproject.toml`, add it in the same PR (no version conflict expected; PyJWT is a stable widely-used dependency).
- **GitHub REST endpoints used**: `POST /app/installations/<id>/access_tokens` and `GET /installation/repositories`. That is the entire outbound surface needed by this feature.
- **App private key format**: PEM-encoded RSA, multi-line. Env var `GITHUB_APP_PRIVATE_KEY` carries it directly OR `GITHUB_APP_PRIVATE_KEY_PATH` points at a file (the latter is common in container deployments).
- **Replay cache implementation**: copy the LRU shape from `services/webhooks/tenant_resolver.py::InstallationCache` (do not depend on it — separate concern). 5-minute TTL, 4096 entries.
- **`selected_repositories` JSONB shape**: a JSON array of strings (`["owner/repo", ...]`) or `NULL`. No nested object. Lookups via Python `set` membership after one `json.loads`. No GIN index in v1 (low per-installation cardinality).
- **Migration ordering**: 0042 is the next free number after 0041 (the latest committed migration on this branch). Verified by `ls db/migrations/` at plan time.

## Phase 1: Design Artifacts

See [data-model.md](./data-model.md) and [contracts/](./contracts/).

Key entity additions in [data-model.md](./data-model.md):
- `provider_installations.selected_repositories JSONB NULL` (the only schema change).

Key contracts in [contracts/](./contracts/):
- `http-integrations-github.md` — install + callback HTTP surface.
- `http-webhooks-github.md` — the additional behavior layered on the existing `/webhooks/{provider}` route for `provider=github`.
- `module-github-client.md` — the outbound REST client API (`mint_installation_token`, `get_installation_repositories`, `request` helper with the uninstall chokepoint).

## Phase 2: Tasks

Generated by `/speckit-tasks` into [tasks.md](./tasks.md).

## Complexity Tracking

No constitution violations. Nothing to justify.
