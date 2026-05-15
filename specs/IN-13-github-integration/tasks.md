---
description: "Task list for IN-13 GitHub Production Integration"
---

# Tasks: IN-13 GitHub Production Integration

**Input**: `/specs/IN-13-github-integration/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/{http-integrations-github,http-webhooks-github,module-github-client}.md
**Branch**: `feat/IN-13-github-integration`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state)
- **[Story]**: User story (US1–US7) the task supports
- File paths are absolute from repo root

---

## Phase 1: Setup

- [ ] **T001** Verify `pyproject.toml` includes `cryptography` (for RSA/JWT signing) and `httpx` (for outbound REST). Add `cryptography` if missing — no version pin change.
- [ ] **T002** Verify migration numbering: the next free migration number after the latest committed file in `db/migrations/`. Use that number for `<NN>_provider_installations_selected_repositories.sql` (plan refers to `0042`; verify against current state at implement time).

---

## Phase 2: Foundational (BLOCKING — must complete before any user story)

- [ ] **T010** Write `db/migrations/<NN>_provider_installations_selected_repositories.sql` adding `ALTER TABLE provider_installations ADD COLUMN IF NOT EXISTS selected_repositories JSONB DEFAULT NULL;` + `COMMENT ON COLUMN`. Wrap in `BEGIN; ... COMMIT;`. Per data-model.md.
- [ ] **T011** Apply migration in dev (`./scripts/apply_migrations.sh` or equivalent). Verify column exists via `\d provider_installations`.
- [ ] **T012** Create `services/integrations/github/__init__.py` (empty package marker).
- [ ] **T013** Create `services/integrations/github/metrics.py` declaring the counters listed in contracts/http-webhooks-github.md (Metrics emitted section). Match the IN-08/IN-09 metrics-module shape (counters as module-level `prometheus_client.Counter` instances behind a singleton registry getter).
- [ ] **T014** [P] Create `services/webhooks/replay_cache.py` with `class ReplayCache(OrderedDict-backed LRU, ttl=300s, max_entries=4096)` and a `noop_replay_cache()` factory for tests. Mirror the shape of `services/webhooks/tenant_resolver.py::InstallationCache`. Methods: `seen(key, now) -> bool`, `remember(key, now) -> None`, `size() -> int`.
- [ ] **T015** [P] Write `services/webhooks/tests/test_replay_cache.py`: TTL expiry, LRU eviction, miss-then-hit, noop variant. Pytest + frozen-clock fixture.

---

## Phase 3: User Story 1 — Webhook Ingestion (P1)

**Goal**: Verified, tenant-resolved GitHub deliveries from selected repos land as Observations.

- [ ] **T100** [US1] Verify the existing `services/webhooks/signatures/github.py::GitHubVerifier` handles the App-level secret list path (load_secrets with `tenant_id=None`). Add unit test in `services/webhooks/tests/test_verifier_github.py` for "rotation list of 2 secrets, deliver signed with either succeeds" if not already present.
- [ ] **T101** [US1] Modify `services/webhooks/router.py::build_webhooks_router::receive` to interpose the GitHub-specific overlay (per contracts/http-webhooks-github.md):
  - Branch on `provider == 'github'` AFTER signature verification and tenant resolution.
  - Step 1: PING short-circuit at the top — if `X-GitHub-Event == 'ping'`, verify-and-return-200 before tenant resolution.
  - Step 6: Replay cache lookup via `request.app.state.github_replay_cache`. Wrap in try/except, increment `github_webhook_replay_cache_bypass_total` on cache exceptions.
  - Step 7: Lifecycle dispatch — if `X-GitHub-Event ∈ {'installation', 'installation_repositories'}`, call `services.integrations.github.uninstall.handle_lifecycle_event(...)` and return 200 with `{handled: 'lifecycle', event, action}`.
  - Step 8: Repo-filter — load `selected_repositories` for the resolved installation, short-circuit with 200 `{handled: 'filtered_repo'}` + metric if not in allowlist.
- [ ] **T102** [US1] Wire the replay cache into the FastAPI lifespan: in `services/gateway/main.py` (or whichever module owns lifespan startup), construct `ReplayCache(...)` once and store on `app.state.github_replay_cache`. Add a teardown noop (no resources to release).
- [ ] **T103** [US1] Write `services/webhooks/tests/test_router_github.py`:
  - Verified `pull_request.opened` for in-selection repo → 201 + observation row.
  - Verified `pull_request` from unknown installation → 401 `unknown_installation`.
  - Verified `pull_request` for repo NOT in `selected_repositories` → 200 `{handled: 'filtered_repo'}` + metric.
  - Same `X-GitHub-Delivery` twice within 5 min → 200 `{handled: 'replay'}`, one observation.
  - Different `X-GitHub-Delivery`, same payload → second is observation-layer-deduped (200, `deduped=true`).
  - `pull_request.synchronize` after `pull_request.opened` for same PR → both produce observation events (different action, observation upsert).
- [ ] **T104** [US1] Integration test `tests/integration/test_github_webhook_e2e.py`: seed an installation row + secret, POST a signed `pull_request` and `issue_comment` and `check_run` payload, assert each produces a correctly-shaped observation row (text format per the existing shaper, trust_tier per Assumption §Trust tiers).

---

## Phase 4: User Story 2 — Self-Serve Install (P1)

**Goal**: GitHub org admin completes install → row written → ready to receive webhooks.

- [ ] **T200** [US2] Create `services/integrations/github/oauth.py`:
  - `install_handler(request: Request) -> RedirectResponse` per contracts/http-integrations-github.md.
    - Generates nonce, builds state token (HMAC over `{tenant_id, nonce, exp=now+600}`), inserts into `oauth_install_states`, 302s to `https://github.com/apps/<GITHUB_APP_SLUG>/installations/new?state=<token>`.
  - `callback_handler(request: Request) -> RedirectResponse`:
    - Verify state token (HMAC + expiry + atomic nonce consume — copy the IN-08 idiom exactly).
    - Extract `installation_id`, `setup_action` from query.
    - Mint installation access token via `GithubClient.mint_installation_token`.
    - Call `GithubClient.get_installation_repositories(installation_id)` → `list[str] | None`.
    - UPSERT `provider_installations` with `provider='github', installation_id, tenant_id, secret_ref=NULL (or per data-model.md R3 strategy), enabled=TRUE, selected_repositories=<list-or-NULL>`.
    - On `(provider, installation_id)` conflict with mismatched tenant_id: raise `GithubInstallationCollisionError`, write audit row `status='rejected_collision'`, 302 to `install-error?reason=installation_collision`.
    - Write `installation_audit_log` row `action='install', status='ok'`.
    - 302 to `/integrations/github/installed?installation=<short_hash>`.
- [ ] **T201** [US2] Modify `services/integrations/router.py::build_integrations_router` to mount:
  - `GET /integrations/github/install` → `github_oauth.install_handler(request)`
  - `GET /integrations/github/callback` → `github_oauth.callback_handler(request)`
- [ ] **T202** [US2] Update CLAUDE.md or comment at the integrations router to record IN-13 added these routes.
- [ ] **T203** [US2] Write `services/integrations/github/tests/test_oauth_install.py`:
  - Authenticated tenant `GET /install` → 302 with `Location` matching `^https://github\.com/apps/.*\?state=`.
  - State token has the expected payload + signature.
  - Nonce row exists in `oauth_install_states` with `consumed_at IS NULL`.
- [ ] **T204** [US2] Write `services/integrations/github/tests/test_oauth_callback.py`:
  - Valid state → row UPSERT + audit row + 302 to success page.
  - Expired state → 302 `install-error?reason=state_expired`, no DB writes.
  - Consumed state → 302 `install-error?reason=state_consumed`, no DB writes.
  - Tampered state HMAC → 302 `install-error?reason=state_invalid`, no DB writes.
  - GitHub mock returns repos `['org/a', 'org/b']` → row's `selected_repositories` is that list.
  - GitHub mock returns `repository_selection='all'` → row's `selected_repositories` is `NULL`.
- [ ] **T205** [US2] Integration test `tests/integration/test_github_install_e2e.py`: full install flow against a `httpx.MockTransport` GitHub API. Assert all artifacts (row, audit, redirect target, metrics) at end-to-end.

---

## Phase 5: User Story 3 — App-Level Secret + Payload-Routed Tenant Isolation (P1)

**Goal**: Document and verify the structural per-tenant property.

- [ ] **T300** [US3] In `services/integrations/github/oauth.py`, ensure the secret-loading path at the verifier (already FR-007) loads via `load_secrets(provider='github', tenant_id=None, app_state=...)`. No new code.
- [ ] **T301** [US3] In `services/gateway/main.py` (or wherever startup config is asserted): if `FYRALIS_ENV == 'prod'`, fail-loud at boot if no `github:app:webhook_secret` (or equivalent ref per data-model.md R3) exists in the secret store. Add an integration test `tests/integration/test_github_prod_secret_required.py` for this.
- [ ] **T302** [US3] Write `services/integrations/github/tests/test_secret_isolation.py`:
  - Two tenants installed → both deliveries route via `installation.id` to the correct tenant's substrate.
  - Delivery signed with wrong secret → 401 `signature_mismatch`.
  - Env var `GITHUB_WEBHOOK_SECRET` is set to a wrong value but a correct secret-store entry exists → verification still succeeds (env var is ignored in non-bootstrap path).

---

## Phase 6: User Story 4 — Uninstall Chokepoint (P2)

**Goal**: Both inbound `installation.deleted` and outbound 401/404 disable the row idempotently.

- [ ] **T400** [US4] Create `services/integrations/github/client.py`:
  - `mint_app_jwt(private_key_pem, app_id, now=None) -> str` per contracts/module-github-client.md.
  - `class GithubClient` with constructor + `mint_installation_token(installation_id) -> InstallationToken` + `get_installation_repositories(installation_id) -> list[str] | None`.
  - `_disable_github_installation(installation_id, trigger)` — the shared chokepoint.
  - `GithubApiError`, `GithubInstallationRevokedError` exception types.
  - Token cache: in-process dict, TTL = `expires_at - now - 60s`.
- [ ] **T401** [US4] Create `services/integrations/github/uninstall.py`:
  - `handle_lifecycle_event(...)` — dispatched from the webhook router for `installation` and `installation_repositories` events. Switch on `payload.action`:
    - `installation.created` → no-op + audit row `install_webhook_ack`.
    - `installation.deleted` → call `_disable_github_installation(installation_id, trigger='webhook_installation_deleted')`.
    - `installation.suspend` → UPDATE `enabled=FALSE`; audit `action='suspend', status='ok'`.
    - `installation.unsuspend` → UPDATE `enabled=TRUE`; audit `action='unsuspend', status='ok'`.
    - `installation_repositories.added` / `.removed` → mutate `selected_repositories` JSONB; audit `action='repo_change'`.
- [ ] **T402** [US4] Wire `GithubClient` into FastAPI lifespan: construct once in `services/gateway/main.py` with the env-loaded private key, store on `app.state.github_client`.
- [ ] **T403** [US4] Write `services/integrations/github/tests/test_uninstall_inbound.py`:
  - `installation.deleted` webhook → row flipped, audit row, next inbound delivery returns 401.
  - `installation.suspend` → row disabled.
  - `installation.unsuspend` → row re-enabled.
- [ ] **T404** [US4] Write `services/integrations/github/tests/test_uninstall_outbound_chokepoint.py`:
  - Mock `mint_installation_token` to receive 404 from GitHub → chokepoint fires, raises `GithubInstallationRevokedError`.
  - Mock to receive 401 with `message=Bad credentials` → identical behavior.
  - Concurrent webhook + outbound 404 → both invocations idempotent; final state is `enabled=FALSE`, two audit rows accepted.
- [ ] **T405** [US4] Integration test `tests/integration/test_github_uninstall_concurrent.py` per SC-005: simulate the race with `asyncio.gather` of webhook + outbound paths, assert correctness.

---

## Phase 7: User Story 5 — Repo Selection (P2)

**Goal**: `installation_repositories` events mutate the allowlist; non-selected repos drop with metric.

- [ ] **T500** [US5] In `services/integrations/github/uninstall.py::handle_lifecycle_event`, implement the `installation_repositories.added` / `.removed` branches:
  - Load current `selected_repositories` (or treat NULL as "all" — explicit selection cannot be enabled by a `.added`; the column stays NULL if the App was installed with all-repos permission).
  - For `.added`: union the JSONB list with `payload.repositories_added[*].full_name`.
  - For `.removed`: difference the JSONB list with `payload.repositories_removed[*].full_name`.
  - UPDATE `provider_installations SET selected_repositories=$1 WHERE id=$2`.
  - Audit `action='repo_change', status='ok', context={added, removed}`.
- [ ] **T501** [US5] In `services/webhooks/router.py` repo-filter branch: load `selected_repositories` for the resolved installation. If `NULL`, skip filter. If non-NULL, check if `payload.repository.full_name in selected_repositories` → continue or short-circuit with 200 `filtered_repo`.
- [ ] **T502** [US5] Write `services/integrations/github/tests/test_repo_selection.py`:
  - `selected_repositories=NULL` → all repos pass.
  - `selected_repositories=['org/a']`, delivery for `org/a` → ingested.
  - Same row, delivery for `org/b` → 200 `filtered_repo`, no observation.
  - `installation_repositories.added(['org/b'])` then re-deliver for `org/b` → now ingested.
  - `installation_repositories.removed(['org/a'])` then re-deliver for `org/a` → 200 `filtered_repo`.

---

## Phase 8: User Story 6 — Replay Protection (P3)

**Goal**: Re-delivered `X-GitHub-Delivery` within 5 min drops without re-triggering downstream work.

- [ ] **T600** [US6] In `services/webhooks/router.py` (covered by T101 step 6): ensure replay-check runs AFTER signature verification, BEFORE lifecycle/repo-filter/ingestion. On hit, return 200 `{handled: 'replay'}` + increment metric.
- [ ] **T601** [US6] Write `services/integrations/github/tests/test_replay_protection.py`:
  - POST delivery → 201, observation written, `trigger_queue` row enqueued.
  - POST same `(installation_id, X-GitHub-Delivery)` within 5 min → 200 `replay`, zero new observations, zero new `trigger_queue` rows.
  - Same delivery after 5+ min (frozen clock fast-forward) → request processed, observation-layer dedup catches it (`deduped=true`).
  - Two different `X-GitHub-Delivery` UUIDs same payload → both reach ingestion; second is observation-layer-deduped.

---

## Phase 9: User Story 7 — Observability (P3)

**Goal**: Aggregate metrics + structured logs with no per-installation label cardinality.

- [ ] **T700** [US7] In `services/integrations/github/metrics.py` (T013), declare all counters listed in spec FR-017 / contracts/http-webhooks-github.md. Verify none carry per-installation labels.
- [ ] **T701** [US7] In all log lines emitted by `services/integrations/github/*.py` and the github branch of `services/webhooks/router.py`, ensure: include `installation_row_id`, `tenant_id`, `delivery_id`, `event_type`, `installation_id_hash`. NEVER include raw `installation_id`, `account.login`, `account.id`, or App private key.
- [ ] **T702** [US7] Add `short_installation_hash(installation_id: str) -> str` helper using BLAKE2b 8-byte digest, mirroring IN-09's `short_guild_hash`. Place in `services/integrations/github/__init__.py` or a small `_hashing.py` submodule.
- [ ] **T703** [US7] Write `services/integrations/github/tests/test_log_hygiene.py`: grep the captured log output for any raw `installation_id` pattern (regex `\b\d{6,}\b` for a numeric id alongside the literal string `installation_id=`). Assert zero matches across the test suite.
- [ ] **T704** [US7] Write `services/integrations/github/tests/test_metrics.py`: invoke a mix of valid/replay/filtered/lifecycle deliveries, scrape the registry, assert each counter increments per the spec's SC-001..SC-007 thresholds.

---

## Phase 10: Polish

- [ ] **T800** Update `CODEBASE-ARCHITECTURE.md` §X (integrations) with a paragraph describing the new GitHub integration and its files. Match the IN-08 / IN-09 style.
- [ ] **T801** Update `README.md` install runbook with the GitHub App registration steps: create App in GitHub developer settings, set webhook URL, set webhook secret, generate private key, export env vars.
- [ ] **T802** Run `python scripts/check_schema_drift.py` and verify zero drift.
- [ ] **T803** Run `git diff --stat main...HEAD` and verify only the files listed in SC-011 changed.
- [ ] **T804** Run the full test suite: `pytest services/integrations/github/ services/webhooks/tests/test_router_github.py services/webhooks/tests/test_replay_cache.py tests/integration/test_github_*.py -v`. Verify all green.
- [ ] **T805** Tail `/tmp/fyralis_logs/gateway.log` during a smoke run and grep for any raw installation_id leakage (per SC-008). Verify zero matches.
- [ ] **T806** Run quickstart.md end-to-end against a fresh DB. Verify every step's expected outcome.

---

## Dependency Graph

```text
T001/T002 (setup) → T010/T011 (migration) → T012/T013/T014/T015 (foundational)
                                            │
                                            ├─→ T100..T104  (US1 — webhook ingest)
                                            │     │
                                            │     ├─→ T200..T205 (US2 — install flow)
                                            │     │     │
                                            │     │     ├─→ T300..T302 (US3 — secret isolation)
                                            │     │     │
                                            │     │     ├─→ T400..T405 (US4 — uninstall)
                                            │     │     │
                                            │     │     ├─→ T500..T502 (US5 — repo selection)
                                            │     │     │
                                            │     │     ├─→ T600..T601 (US6 — replay)
                                            │     │     │
                                            │     │     └─→ T700..T704 (US7 — observability)
                                            │     │
                                            │     └─→ Polish T800..T806
```

Tasks within the same phase marked `[P]` are independent and can run in parallel. T014/T015 are independent of T012/T013 (different file paths, no shared module).

## Estimated effort

| Phase | Tasks | LoC (new) | LoC (test) | Effort |
|---|---|---|---|---|
| Setup | T001–T002 | 0 | 0 | 0.5h |
| Foundational | T010–T015 | ~150 | ~100 | 2h |
| US1 webhook ingest | T100–T104 | ~150 | ~250 | 4h |
| US2 install flow | T200–T205 | ~300 | ~250 | 6h |
| US3 secret isolation | T300–T302 | ~30 | ~150 | 2h |
| US4 uninstall chokepoint | T400–T405 | ~250 | ~300 | 6h |
| US5 repo selection | T500–T502 | ~80 | ~150 | 2h |
| US6 replay | T600–T601 | ~30 | ~100 | 1h |
| US7 observability | T700–T704 | ~50 | ~150 | 2h |
| Polish | T800–T806 | ~50 | 0 | 2h |
| **Total** | | **~1090** | **~1450** | **~28h** |

This is a multi-day implementation effort. The user stories are designed to be independently mergeable; US1 alone is the MVP "we can ingest GitHub events", US2 layers the self-serve flow on top, US3 is a documented property test, US4 closes the uninstall loop, US5–US7 are operational hardening.
