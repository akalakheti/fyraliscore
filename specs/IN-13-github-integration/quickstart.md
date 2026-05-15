# Quickstart: IN-13 GitHub Production Integration

Smoke-test runbook for a freshly merged build. Verifies the install → deliver → uninstall flow against a mocked GitHub API.

## Prerequisites

- `docker compose up postgres` running on port 5433 (per project setup).
- `.venv` activated with Python 3.12.
- Migrations applied through `0042_provider_installations_selected_repositories.sql`.
- Env vars set:
  - `GITHUB_APP_ID=<app id>` (any string is fine for the smoke test; the mocked API does not validate).
  - `GITHUB_APP_SLUG=fyralis-test`
  - `GITHUB_APP_PRIVATE_KEY=<-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n>` (multi-line PEM; generate one via `openssl genrsa -out test.pem 2048` and `cat test.pem`).
  - `GITHUB_WEBHOOK_SECRET=test-webhook-secret-do-not-use-in-prod` (dev fallback for the bootstrap PING and v1 verification).
  - `GITHUB_OAUTH_STATE_SECRET=test-state-hmac-secret`
  - `FYRALIS_ENV=dev`
  - `DEEPSEEK_API_KEY=<any-value>` (existing project requirement; the smoke test does not invoke LLM paths).

## Step 1 — Boot the gateway

```bash
source .venv/bin/activate
./scripts/start.sh
```

Tail the log:

```bash
tail -f /tmp/fyralis_logs/gateway.log
```

Expected: gateway listens on `:8000`. No errors about missing GitHub config.

## Step 2 — Simulate the install flow

In a second terminal:

```bash
# 2.1 — Hit the install endpoint as an authenticated tenant. This requires a Bearer token; either use a test-fixture token from the conftest or run the dev-token issuance helper.
curl -i -H "Authorization: Bearer $(./scripts/dev_issue_token.sh)" \
  "http://localhost:8000/integrations/github/install"
```

Expected: HTTP 302 to `https://github.com/apps/fyralis-test/installations/new?state=<token>`.

Capture the `state` query param from the `Location` header.

```bash
# 2.2 — Simulate GitHub's callback (in real life this is a browser redirect from GitHub's consent screen).
curl -i \
  "http://localhost:8000/integrations/github/callback?installation_id=99999999&setup_action=install&state=<token from step 2.1>"
```

Expected: HTTP 302 to `/integrations/github/installed?installation=<short_hash>`.

Verify the row was written:

```bash
psql -h localhost -p 5433 -U fyralis -d fyralis -c \
  "SELECT id, tenant_id, installation_id, enabled, selected_repositories FROM provider_installations WHERE provider='github' AND installation_id='99999999';"
```

Expected: one row, `enabled=t`, `selected_repositories` either `NULL` or a JSONB list (depending on whether the GitHub mock returned all-repos or selected).

## Step 3 — Deliver a synthetic webhook

```bash
# 3.1 — Build a signed pull_request payload.
PAYLOAD='{"action":"opened","pull_request":{"number":1,"title":"smoke test","node_id":"PR_abc","base":{"ref":"main"},"updated_at":"2026-05-15T12:00:00Z","created_at":"2026-05-15T12:00:00Z"},"installation":{"id":99999999},"repository":{"full_name":"smoketest-org/repo-a"},"sender":{"login":"octocat"}}'
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "test-webhook-secret-do-not-use-in-prod" -hex | awk '{print $NF}')"

curl -i \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: 11111111-2222-3333-4444-555555555555" \
  -d "$PAYLOAD" \
  http://localhost:8000/webhooks/github/events
```

Expected: HTTP 201 with `{observation_id: <uuid>, deduped: false, ...}`.

Verify the Observation:

```bash
psql -h localhost -p 5433 -U fyralis -d fyralis -c \
  "SELECT id, source_channel, external_id, content_text, trust_tier FROM observations WHERE source_channel='github:webhook' ORDER BY created_at DESC LIMIT 1;"
```

Expected: one row, `external_id='PR_abc'`, `content_text='octocat opened PR #1 \\'smoke test\\' against main'`.

## Step 4 — Verify replay protection

Re-POST the exact same delivery within 5 minutes:

```bash
curl -i ... (same as step 3.1)
```

Expected: HTTP 200 with `{handled: "replay"}`. No new row in `observations`. Counter `github_webhook_replay_dropped_total` increments.

## Step 5 — Verify uninstall via webhook

```bash
# 5.1 — Build an installation.deleted payload.
UNINSTALL_PAYLOAD='{"action":"deleted","installation":{"id":99999999,"account":{"login":"smoketest-org"}}}'
UNINSTALL_SIG="sha256=$(echo -n "$UNINSTALL_PAYLOAD" | openssl dgst -sha256 -hmac "test-webhook-secret-do-not-use-in-prod" -hex | awk '{print $NF}')"

curl -i \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $UNINSTALL_SIG" \
  -H "X-GitHub-Event: installation" \
  -H "X-GitHub-Delivery: 22222222-3333-4444-5555-666666666666" \
  -d "$UNINSTALL_PAYLOAD" \
  http://localhost:8000/webhooks/github/events
```

Expected: HTTP 200 with `{handled: "lifecycle", event: "installation", action: "deleted"}`.

Verify the row was disabled:

```bash
psql -h localhost -p 5433 -U fyralis -d fyralis -c \
  "SELECT enabled FROM provider_installations WHERE installation_id='99999999';"
```

Expected: `enabled=f`.

## Step 6 — Verify post-uninstall rejection

Re-attempt the step-3 delivery:

```bash
curl -i ... (same as step 3.1, different X-GitHub-Delivery to bypass replay)
```

Expected: HTTP 401 with `{code: "unknown_installation"}`. Counter `github_webhook_signature_failure_total{reason="unknown_installation"}` increments. No raw `installation_id` in logs.

## Step 7 — Cleanup

```bash
psql -h localhost -p 5433 -U fyralis -d fyralis -c \
  "DELETE FROM installation_audit_log WHERE installation_row_id IN (SELECT id FROM provider_installations WHERE installation_id='99999999'); \
   DELETE FROM provider_installations WHERE installation_id='99999999';"
```

## Negative paths (smoke-test rejection scenarios)

| Scenario | curl invocation | Expected |
|---|---|---|
| Wrong signature | tamper with `SIGNATURE` in step 3.1 | 401 `signature_mismatch` |
| Missing `X-GitHub-Event` header | omit the `-H "X-GitHub-Event: ..."` | 400 `missing X-GitHub-Event header` |
| Body > 1 MB | `-d "$(python -c 'print("x"*1100000)')"` | 413 `payload_too_large` |
| Unsupported event type | `-H "X-GitHub-Event: release"` | 400 with `supported: [...]` |
| Cross-tenant rebind | repeat step 2.2 with a different tenant's Bearer | 302 to `install-error?reason=installation_collision` |
| Bootstrap ping (no install row) | `-H "X-GitHub-Event: ping"` on a fresh DB | 200 `{handled: "ping"}` |

## Observability checklist

- `curl http://localhost:8000/metrics | grep ^github_webhook_`
  - Expect counters: `received_total`, `verified_total{result}`, `signature_failure_total{reason}`, `replay_dropped_total`, `filtered_repo_total`, `lifecycle_total{event,action}`, `replay_cache_bypass_total`.
- `grep github_install /tmp/fyralis_logs/gateway.log | head`
  - Expect lines with `installation_row_id`, `tenant_id`, `installation_id_hash`. No raw `installation_id`.
- `psql -h localhost -p 5433 -U fyralis -d fyralis -c \
   "SELECT action, status, COUNT(*) FROM installation_audit_log WHERE installation_row_id IN (SELECT id FROM provider_installations WHERE provider='github') GROUP BY 1,2 ORDER BY 1;"`
  - Expect rows for `install/ok`, `uninstall/ok`.
