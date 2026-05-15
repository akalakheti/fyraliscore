# Data Model: IN-13 GitHub Production Integration

This feature adds **one** column to one existing table. No new tables.

## Migration

`db/migrations/0040_github_integration.sql`:

```sql
-- 0040_github_integration.sql — IN-13
-- Adds the per-installation repository selection allowlist for the
-- GitHub App integration. NULL means "all repositories" (matches
-- GitHub App's repository_selection='all' permission); a JSONB array
-- of "<owner>/<repo>" full-name strings means an explicit curated
-- selection. The column is unused by every other provider
-- (Slack, Discord, Linear, Stripe), which all leave it at the
-- default NULL value.
--
-- Idempotent (re-running the migration against an applied DB is a
-- no-op per Constitution §II.2).

ALTER TABLE provider_installations
    ADD COLUMN IF NOT EXISTS selected_repositories JSONB DEFAULT NULL;

COMMENT ON COLUMN provider_installations.selected_repositories IS
    'IN-13 GitHub: NULL = all repos; JSONB array of "<owner>/<repo>" = curated selection.';
```

No new index — the column is read on the same row as the existing primary-key fetch (`SELECT … FROM provider_installations WHERE id=$1`); no additional access path is introduced.

No backfill — existing Slack / Discord / Linear / Stripe rows take the default `NULL`, which is semantically inert for those providers.

No CHECK constraint — the column's value can legitimately be `NULL` (all-repos installation), `[]` (curated empty), or a list of strings. The shape is validated at write time by application code (`services/integrations/github/oauth.py` and `services/integrations/github/lifecycle.py`).

## Affected existing tables

### `provider_installations` (existing — IN-08 migration 0039)

After this migration:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | uuid7 (unchanged) |
| `tenant_id` | UUID FK → tenants(id) DEFERRABLE INITIALLY IMMEDIATE | unchanged |
| `provider` | TEXT | accepts `'github'` (already in the IN-07 resolver's `ResolverProvider` literal) |
| `installation_id` | TEXT | GitHub's numeric installation id, stringified |
| `secret_ref` | TEXT | `'github:installation:<installation_id>'` (per-tenant) or `'github:app:webhook_master'` (master) — see research.md R3 |
| `enabled` | BOOLEAN | TRUE on install; flipped to FALSE on uninstall/suspend |
| `installed_at` | TIMESTAMPTZ | unchanged |
| **`selected_repositories`** | **JSONB DEFAULT NULL** | **NEW** — NULL = all repos; list = curated |

Existing unique constraint: `(provider, installation_id)` — unchanged.
Existing RLS policy `tenant_isolation` — unchanged; the new column inherits the policy.
Existing index `idx_provider_installations_tenant_provider` — unchanged.

### `encrypted_secrets` (existing — IN-08)

Two new logical keys (the table shape is unchanged):
- `secret_ref='github:app:webhook_master'` — one row, persisted at App-creation time by an operator. Plaintext = the App-level webhook secret entered in GitHub's App settings UI. Encrypted under tenant-bound envelope key (the row is "owned" by the operator-tenant; reads via `secret_store.get(secret_ref, tenant_id=<operator>)`).
- `secret_ref='github:installation:<installation_id>'` — one row per installation. Plaintext is identical to the master in v1 (per research.md R3); the per-tenant ciphertext distinction comes from envelope-encryption nonces being per-tenant. Created by the OAuth callback (T012, T043). Deleted by `_disable_and_zeroize_github` on uninstall.

### `installation_audit_log` (existing — IN-08)

New row patterns written:
- `action='install', status='ok'` — successful OAuth callback completed
- `action='install', status='rejected_collision'` — cross-tenant installation_id collision rejected
- `action='reinstall', status='ok'` — same-tenant re-install (FR-006)
- `action='update', status='ok'` — setup_action='update' refresh of `selected_repositories` (FR-004)
- `action='uninstall', status='ok', context={trigger}` — chokepoint fired (trigger ∈ {`webhook_installation_deleted`, `outbound_401`, `outbound_404`})
- `action='suspend', status='ok'` — installation.suspended event
- `action='unsuspend', status='ok'` — installation.unsuspended event
- `action='repo_change', status='ok', context={added, removed}` — installation_repositories event
- `action='install_webhook_ack', status='ok'` — redundant installation.created webhook (the OAuth callback already wrote the row)

The table shape and RLS / tenant_id semantics are unchanged.

### `oauth_install_states` (existing — IN-08, re-used by IN-09 for `provider='discord'`)

Accepts `provider='github'` writes — the `provider` column is text-typed and accepts any string (verified against the IN-08 migration). No schema change. State token TTL and nonce-consume semantics are reused exactly from IN-08.

### `observations` (existing — substrate foundation)

No schema change. GitHub webhook deliveries produce observations with `source_channel='github:webhook'` (already in `services/ingestion/handlers/CHANNEL_TRUST_MAP`). The existing event shapers `_shape_pull_request`, `_shape_push`, `_shape_issues`, `_shape_issue_comment`, `_shape_pull_request_review`, `_shape_check_run` produce the observation drafts unchanged per spec FR-019.

### `trigger_queue` (existing — substrate)

No schema change. GitHub-sourced observations enqueue downstream triggers via the existing `services/ingestion/core.py::ingest()` path; the post-commit worker consumes them.

## Read paths

| Read | SQL | When |
|---|---|---|
| Resolve `(provider='github', installation.id)` → `(tenant_id, installation_row_id, secret_ref)` | existing `TenantResolver._resolve` (cache + DB) | every webhook delivery |
| Load `selected_repositories` for repo-filter check | `SELECT selected_repositories FROM provider_installations WHERE id=$1` | every webhook delivery after tenant-resolve (FR-008b) |
| Load `secret_ref` content for signature verification | existing `services/webhooks/secrets.py::load_secrets` | every webhook delivery |
| Load App private key for JWT mint | `secret_store.get('github:app:private_key', operator_tenant_id)` OR env var `GITHUB_APP_PRIVATE_KEY_PEM` | every installation token mint |

## Write paths

| Write | SQL | When |
|---|---|---|
| INSERT `oauth_install_states` (state token nonce) | existing IN-08 path | `/integrations/github/install` |
| Atomic UPDATE `oauth_install_states` SET consumed=TRUE WHERE …  | existing IN-08 path | `/integrations/github/callback` start |
| UPSERT `provider_installations` with `provider='github'`, full row | application-level upsert via `INSERT … ON CONFLICT (provider, installation_id) DO UPDATE …` | `/integrations/github/callback` success |
| INSERT `encrypted_secrets` row for `github:installation:<id>` | `secret_store.put(secret_ref, plaintext, tenant_id)` | `/integrations/github/callback` success |
| INSERT `installation_audit_log` row | application-level INSERT | every install/uninstall/lifecycle transition |
| UPDATE `provider_installations` SET enabled=FALSE WHERE id=$1 | inside `_disable_and_zeroize_github` | uninstall chokepoint |
| DELETE `encrypted_secrets` row | `secret_store.delete(secret_ref, tenant_id)` | uninstall chokepoint |
| UPDATE `provider_installations` SET selected_repositories=$1 WHERE id=$2 | inside `handle_installation_repositories_event` | every `installation_repositories` webhook |

## State transitions for `provider_installations(provider='github')`

```
       ┌────────────────────────────────────────────┐
       │  (no row exists)                           │
       └──────────────────┬─────────────────────────┘
                          │
              OAuth callback success
                          │
                          ▼
       ┌────────────────────────────────────────────┐
       │  enabled=TRUE, selected_repositories=<…>   │
       └─────┬────────┬─────────────┬────────┬──────┘
             │        │             │        │
             │  installation_       │        │
             │  repositories       installation.suspend
             │   (added/removed)   │
             │        │             │
             │        ▼             ▼
             │  selected_       enabled=FALSE,
             │  repositories    secret retained
             │  updated         │
             │                  │ installation.unsuspend
             │                  │
             │                  ▼
             │              enabled=TRUE,
             │              same secret_ref
             │
             │  installation.deleted
             │     OR outbound 401/404
             ▼
       ┌────────────────────────────────────────────┐
       │  enabled=FALSE, secret_ref content deleted │
       └──────────────────┬─────────────────────────┘
                          │
              Re-install: OAuth callback
                          │
                          ▼
       ┌────────────────────────────────────────────┐
       │  enabled=TRUE, new secret_ref content      │
       │  (same row id reused, audit chain preserved)│
       └────────────────────────────────────────────┘
```

## Idempotency invariants

1. **Same OAuth state token consumed twice → same outcome**: nonce-consume is an atomic UPDATE; the second consumer sees the prior consumption and 302s to `install-error?reason=state_consumed`. (FR-002, SC-009)
2. **Same `installation_id` re-installed by same tenant → row id preserved**: UPSERT on `(provider, installation_id)`; no duplicate row. (FR-006)
3. **Cross-tenant rebind → rejected**: UPSERT detects tenant_id mismatch, raises `GithubInstallationCollisionError`. (FR-005, SC-009)
4. **Concurrent uninstall paths (webhook + outbound 404) → single end state, idempotent audit**: `UPDATE … SET enabled=FALSE` is idempotent; `secret_store.delete` suppresses `SecretNotFoundError` on second invocation; two audit rows accepted (FR-013, SC-005).
5. **Same `installation_repositories.added` webhook redelivered → idempotent**: the merge is a set-union; re-applying produces the same final state.

## Tenant scoping

- `provider_installations.tenant_id` is the load-bearing field. RLS policy `tenant_isolation` enforces it at the DB layer.
- `selected_repositories` inherits the same row's tenant scoping; no per-repo tenant column.
- `encrypted_secrets` rows are tenant-scoped via the secret store's envelope keys.
- `installation_audit_log` rows carry `tenant_id` (inherited from IN-08).

## Counter-examples (what this feature does NOT introduce)

- **No new substrate foundation**. The four foundations remain `Observations / Models / Acts / Resources`.
- **No new tenant-scoped table**. `selected_repositories` rides on the existing `provider_installations` row.
- **No `uuid.uuid4()`**. All new substrate row ids use `uuid7()` via the existing handler / OAuth paths.
- **No new RLS surface**. The new column inherits the existing `tenant_isolation` policy.
- **No new partition**. `observations` partitioning is unchanged.
