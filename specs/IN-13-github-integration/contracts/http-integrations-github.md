# Contract: HTTP `/integrations/github/*`

Mounted by `services/integrations/router.py::build_integrations_router`. The integrations router is excluded from the gateway's public-path allowlist; the install route requires Bearer auth, the callback route is authenticated by the state-token HMAC.

## `GET /integrations/github/install`

**Auth**: Bearer (existing gateway middleware). Tenant_id is taken from the authenticated session's `request.state.tenant_id`.

**Query params**: none.

**Behavior**:
1. Generate a fresh nonce (32 random bytes, hex-encoded).
2. Compute `state_payload = json.dumps({tenant_id, nonce, exp})` where `exp = now + 600` (10 min TTL — matches IN-08).
3. Compute `state_token = base64url(state_payload) + '.' + base64url(HMAC(GITHUB_OAUTH_STATE_SECRET, state_payload))`.
4. INSERT one row in `oauth_install_states` `(provider='github', nonce, tenant_id, expires_at, consumed_at=NULL)`.
5. 302 to `https://github.com/apps/<GITHUB_APP_SLUG>/installations/new?state=<state_token>`.

**Response codes**:
- `302` — happy path.
- `401` — unauthenticated (no Bearer token; emitted by gateway middleware before reaching this handler).
- `500` — secret-store unreachable or DB insert failure.

**Logs**: structlog `github_install_initiated`, fields: `tenant_id`, `nonce_prefix` (first 8 chars of nonce).

**Metrics**: `github_install_callback_total{outcome='initiated'}` increments.

---

## `GET /integrations/github/callback`

**Auth**: public route. Authenticated by the state-token HMAC + atomic nonce-consume.

**Query params**:
- `installation_id` — string, GitHub's numeric installation id
- `setup_action` — string, `'install' | 'update'`
- `state` — opaque state token from the install step

**Behavior**:

```
1. Decode state_token. Verify HMAC + expiry.
   On failure → 302 to /integrations/github/install-error?reason=state_invalid
2. Atomic UPDATE oauth_install_states
       SET consumed_at = now()
     WHERE nonce = $1
       AND tenant_id = $2
       AND expires_at > now()
       AND consumed_at IS NULL
   On 0 rows updated → 302 to /integrations/github/install-error?reason=state_consumed
3. If setup_action == 'install':
     a. Mint App JWT (services/integrations/github/jwt.py::mint_app_jwt)
     b. Exchange JWT for installation access token
        (POST https://api.github.com/app/installations/<id>/access_tokens)
        Response: { token, expires_at, repository_selection, repositories }
        On 401 → 302 to install-error?reason=app_credentials_invalid
        On 404 → 302 to install-error?reason=installation_revoked_before_callback
                 (this can happen if the user uninstalls between consent and callback)
        On 5xx → 302 to install-error?reason=github_unavailable
     c. Generate or look up secret_ref for this installation:
        secret_ref = f'github:installation:{installation_id}'
        plaintext = load_master_webhook_secret(secret_store)
        secret_store.put(secret_ref, plaintext, tenant_id=tenant_from_state)
     d. selected_repositories = (
            None if repository_selection == 'all'
            else [r['full_name'] for r in repositories]
        )
     e. UPSERT provider_installations (
            INSERT (provider='github', installation_id, tenant_id, secret_ref,
                    enabled=TRUE, selected_repositories)
            ON CONFLICT (provider, installation_id) DO UPDATE …
        )
        If existing row.tenant_id != incoming tenant_from_state:
            raise GithubInstallationCollisionError
            → audit row action='install', status='rejected_collision'
            → 302 to install-error?reason=installation_collision
            (foreign tenant_id NOT in response, redirect, or logs)
        Else if existing row exists:
            UPDATE enabled=TRUE, rotate secret_ref, refresh selected_repositories
            → audit row action='reinstall', status='ok'
        Else:
            INSERT new row
            → audit row action='install', status='ok'
     f. Invalidate tenant_resolver cache for ('github', installation_id)
     g. 302 to /integrations/github/installed?installation=<short_hash>
4. If setup_action == 'update':
     a. Mint App JWT, exchange for installation token
     b. Refresh selected_repositories from the access-token response's
        repositories list (or via GET /installation/repositories if the
        token endpoint truncates)
     c. UPDATE provider_installations SET selected_repositories=$1 WHERE id=$2
     d. audit row action='update', status='ok'
     e. 302 to /integrations/github/installed?installation=<short_hash>
```

**Response codes**:
- `302` — every path. Success → `installed?installation=<hash>`. Failure → `install-error?reason=<…>`.

**Failure reasons (302 to install-error)**:
- `state_invalid` — HMAC mismatch or malformed state token
- `state_expired` — state token past its `exp`
- `state_consumed` — nonce already consumed (replay attempt)
- `app_credentials_invalid` — App private key or App ID misconfigured (FR-011)
- `installation_revoked_before_callback` — user uninstalled between consent and callback
- `github_unavailable` — GitHub returned 5xx during token exchange
- `installation_collision` — installation_id maps to a different tenant
- `secret_store_error` — DB-backed secret store write failed

**Logs**: structlog `github_callback_received`, fields: `installation_id_hash`, `setup_action`, `state_nonce_prefix`. On success: `github_install_ok` with `installation_row_id`, `tenant_id`, `repo_count`. On failure: `github_install_error` with `reason`.

**Metrics**:
- `github_install_callback_total{outcome='ok'|'state_invalid'|'state_expired'|'state_consumed'|'installation_collision'|'secret_store_error'}` — increments per outcome
- `github_installation_token_mint_total{result='ok'|'error'}` — increments on each mint attempt

---

## `GET /integrations/github/installed`

**Auth**: public route (the user just completed the OAuth flow).

**Query params**:
- `installation` — opaque short hash for display

**Behavior**: Returns HTML 200 with a success page that says "Fyralis is now installed for your GitHub organization." Includes a link back to the Fyralis app dashboard. No DB reads, no DB writes.

**Response codes**: `200`.

---

## `GET /integrations/github/install-error`

**Auth**: public route.

**Query params**:
- `reason` — string from the failure-reasons list above

**Behavior**: Returns HTML 200 with a human-readable error message keyed off `reason`. Includes a "Try again" link to `/integrations/github/install`. No DB reads, no DB writes.

**Response codes**: `200`.

**Logs**: structlog `github_install_error_displayed`, fields: `reason`. No `tenant_id` (the user is post-callback; we may not have a session).

---

## Security properties

- **State token tenant binding**: The state token's `tenant_id` claim is taken from the authenticated session at `/install` issuance, NOT from any client-controllable parameter. A user cannot install on a foreign tenant by manipulating query strings. (FR-002)
- **Single-use state token**: Nonce-consume is an atomic UPDATE. Concurrent callbacks with the same state produce one installation and one `state_consumed` error. (FR-002, SC-009)
- **Foreign tenant id redaction**: On installation_collision, the foreign tenant_id is never echoed in the response body, response headers, redirect URL, or any log line. (FR-005, SC-009)
- **HTTPS only in production**: Both routes are HTTPS-only at the gateway TLS-termination layer. State tokens MUST NOT traverse HTTP.

## Out-of-contract (not handled here)

- The GitHub App's webhook URL is configured outside this route (in the GitHub App's settings page, by an operator). FR-021 documents the value.
- The App's private key is provisioned outside this route (env var or secret store entry; operator-driven). Read on every JWT mint to support rotation.
- The App's webhook master secret is provisioned outside this route (entered in GitHub's App settings UI by the operator, copied to Fyralis's secret store under `secret_ref='github:app:webhook_master'`).
