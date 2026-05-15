# Contract: HTTP `/webhooks/github/events`

The existing webhook router (`services/webhooks/router.py::build_webhooks_router`) handles `/webhooks/{provider}/{subpath:path}` for all providers. This document specifies the **GitHub-specific additions** layered onto that generic flow, not the entire router.

The base route is `POST /webhooks/github/events` (any `subpath` accepted; GitHub uses `events` by convention; the router does not branch on subpath).

## Request

**Method**: `POST`

**Headers** (set by GitHub):
- `X-Hub-Signature-256: sha256=<hex-hmac-sha256(app_webhook_secret, raw_body)>` — required.
- `X-GitHub-Event: <event_type>` — required. Examples: `pull_request`, `issues`, `issue_comment`, `pull_request_review`, `push`, `check_run`, `installation`, `installation_repositories`, `ping`.
- `X-GitHub-Delivery: <uuid>` — required. The replay-cache key.
- `Content-Type: application/json`.
- Body: GitHub webhook event JSON.

**Auth**: cryptographic signature only (the gateway's Bearer middleware skips `/webhooks/*`).

## Processing pipeline (GitHub-specific overlay on the generic router)

The processing order is locked by Clarifications Q4 (signature first, then everything else):

1. **Generic router boilerplate** (unchanged): read raw body, enforce `MAX_PAYLOAD_BYTES`, look up the `github` verifier, best-effort JSON-parse the body.

2. **PING short-circuit (FR-022)**: If `X-GitHub-Event == 'ping'`, verify signature with the App-level secret (or env-var fallback if `FYRALIS_ENV != 'prod'`), then return `HTTP 200 {handled: "ping"}`. No tenant resolution, no observation, no audit row.

3. **Tenant resolution** (existing): the resolver extracts `payload.installation.id` via `_extract_github`. On `UnknownInstallation` outcome, defer to step 5.

4. **Signature verification** (existing `services/webhooks/signatures/github.py::GitHubVerifier`): HMAC-SHA256 over the raw body with the App-level secret list (rotation-capable). On failure, return `401` and increment `github_webhook_signature_failure_total{reason}`.

5. **Tenant-outcome enforcement (existing)**: if `UnknownInstallation`, return `401 unknown_installation`. If `PayloadMissing`, return `400 payload_missing`.

6. **Replay cache (NEW, FR-014)**: check the in-process LRU keyed on `(installation_id, X-GitHub-Delivery)`. On HIT within 5 min, return `HTTP 200 {handled: "replay"}` and increment `github_webhook_replay_dropped_total`. On miss, put a fresh entry and continue.

7. **Lifecycle dispatch (NEW, FR-009/FR-010)**: if `X-GitHub-Event ∈ {'installation', 'installation_repositories'}`, dispatch to `services/integrations/github/uninstall.py::handle_lifecycle_event` (which writes the audit row and possibly mutates the installation row). Return `HTTP 200 {handled: "lifecycle", event, action}`. Do NOT call ingestion.

8. **Repo-filter (NEW, FR-008 step 5)**: if `selected_repositories IS NOT NULL` and `payload.repository.full_name NOT IN selected_repositories`, return `HTTP 200 {handled: "filtered_repo"}` and increment `github_webhook_filtered_repo_total{reason="not_selected"}`. Do NOT call ingestion.

9. **Ingestion (existing)**: call `services/ingestion/core.py::ingest(channel='github:webhook', payload, ...)` which dispatches to the existing event shapers and persists the observation.

## Response codes

| Code | Body shape | When |
|---|---|---|
| `201` | `{observation_id, deduped: false, trigger_queue_id, secret_label}` | Fresh observation committed |
| `200` | `{observation_id, deduped: true, trigger_queue_id, secret_label}` | Observation deduped at the `(source_channel, external_id)` layer |
| `200` | `{handled: "ping"}` | GitHub bootstrap ping |
| `200` | `{handled: "replay"}` | Replay-cache hit within 5 min |
| `200` | `{handled: "lifecycle", event, action}` | `installation` or `installation_repositories` event processed |
| `200` | `{handled: "filtered_repo"}` | Repo not in `selected_repositories` |
| `400` | `{code, message, context}` | Body too large, malformed JSON, unsupported event type, payload missing identifier |
| `401` | `{code, message, context}` | Signature mismatch, missing signature header, unknown_installation |
| `413` | `{code, message, context}` | Body exceeds `MAX_PAYLOAD_BYTES` |
| `501` | `{code, message, context}` | No handler registered (should never fire for github) |

## Metrics emitted

- `github_webhook_received_total` — every inbound request (before signature check).
- `github_webhook_verified_total{result}` — `result ∈ {ok, failed}` post-signature.
- `github_webhook_signature_failure_total{reason}` — `reason ∈ {signature_mismatch, malformed_signature_header, missing_signature, secret_not_configured, unknown_installation}`.
- `github_webhook_replay_dropped_total` — replay-cache hits.
- `github_webhook_replay_cache_bypass_total` — cache backend exceptions swallowed.
- `github_webhook_filtered_repo_total{reason="not_selected"}` — repo not in allowlist.
- `github_webhook_lifecycle_total{event, action}` — `event ∈ {installation, installation_repositories}`, `action` is the GitHub-provided action string.

## Structured log fields (FR-016)

Every log line emitted by the GitHub webhook path MUST include `installation_row_id`, `delivery_id`, `event_type`, and `installation_id_hash` (BLAKE2b 8-byte digest of `installation_id`). Log lines MUST NOT contain raw `installation_id`, `account.login`, `account.id`, or the App's private key.

## Idempotency

- Within a 5-minute window: enforced by the replay cache (`github_webhook_replay_dropped_total` increments on second delivery with same `X-GitHub-Delivery`).
- Across longer windows: enforced by the observation layer's `(source_channel, external_id)` unique constraint (a second insert returns `deduped=true`).
- Lifecycle events: the underlying `_disable_github_installation` and `handle_installation_repositories_event` are idempotent (FR-013).

## Failure modes

| Failure | Behavior |
|---|---|
| Replay cache raises internally | swallow, log, increment `github_webhook_replay_cache_bypass_total`, continue with full processing |
| Tenant resolver DB query fails | propagates as 500 (existing behavior) |
| Ingestion `ValidationError` (unsupported event type) | 400 with `{supported: [...]}` (existing behavior) |
| `installation.deleted` arrives but the row is already disabled | idempotent — second `UPDATE` is a no-op; audit row still written |
| `installation_repositories.added` arrives for an unknown installation | 401 `unknown_installation` (the resolver returns this before lifecycle dispatch) |
