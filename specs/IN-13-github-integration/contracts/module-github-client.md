# Contract: `services/integrations/github/client.py`

Outbound GitHub REST client. The smallest surface that satisfies the foundational needs of IN-13:
- Mint installation access tokens (called from the OAuth callback and from `get_installation_repositories`).
- Fetch the `selected_repositories` list on install / update.
- Provide the uninstall chokepoint (FR-012) by intercepting 401/404 on every outbound call.

Product-feature outbound (PR comments, check runs, issue creation) is OUT OF SCOPE for IN-13.

## Public functions

### `mint_app_jwt(private_key_pem: str, app_id: str, now: int | None = None) -> str`

Pure function. Signs a 9-minute RS256 JWT with:
- `iat = now or int(time.time())`
- `exp = iat + 9 * 60`
- `iss = app_id`

Returns the compact JWT string `<b64url(header)>.<b64url(payload)>.<b64url(signature)>`.

Implementation: hand-rolled using `cryptography.hazmat.primitives.asymmetric.padding.PKCS1v15` + `cryptography.hazmat.primitives.hashes.SHA256` over the loaded RSA private key. ~25 LoC. See research.md R2.

### `class GithubClient`

```python
class GithubClient:
    def __init__(
        self,
        *,
        app_id: str,
        private_key_pem: str,
        pool: asyncpg.Pool,
        secret_store: SecretStore,
        tenant_resolver: TenantResolver,
        http_client: httpx.AsyncClient | None = None,
        now: Callable[[], float] = time.time,
    ) -> None: ...
```

Constructed once at gateway startup, lifetime-managed by FastAPI lifespan. `http_client` is dependency-injected for testing; when omitted, a default `httpx.AsyncClient(timeout=10)` is used.

### `async def mint_installation_token(self, installation_id: str, *, tenant_id: UUID | None = None) -> InstallationToken`

Returns a freshly-minted or cached installation access token. Cache key is `installation_id`; cache entry expires at `expires_at - 60s` safety margin.

Implementation:
1. Check in-process cache. If unexpired, return.
2. Mint a fresh App JWT via `mint_app_jwt(self._private_key_pem, self._app_id)`.
3. `POST https://api.github.com/app/installations/{installation_id}/access_tokens` with `Authorization: Bearer <app_jwt>`, `Accept: application/vnd.github+json`.
4. On 200: parse `{token, expires_at, permissions, repository_selection, repositories}` from response. Cache. Return.
5. On 404 with `documentation_url` containing `/rest/apps/apps#get-an-installation`: invoke chokepoint `_disable_github_installation` and raise `GithubInstallationRevokedError`.
6. On 401 with `message="Bad credentials"`: invoke chokepoint and raise `GithubInstallationRevokedError`.
7. On other 4xx/5xx: raise `GithubApiError(status, code, message)`. The chokepoint does NOT fire on transient failures.

Returns an `InstallationToken` Pydantic model:
```python
class InstallationToken(BaseModel):
    token: str          # GitHub-issued opaque bearer
    expires_at: datetime
    permissions: dict[str, str]
    repository_selection: Literal["all", "selected"]
```

### `async def get_installation_repositories(self, installation_id: str) -> list[str] | None`

Returns the list of `<owner>/<repo>` strings for the installation, or `None` if `repository_selection='all'`.

Implementation:
1. `token = await self.mint_installation_token(installation_id)`.
2. If `token.repository_selection == 'all'`, return `None` (no per-repo list to materialize).
3. Otherwise `GET https://api.github.com/installation/repositories` with `Authorization: Bearer <installation_token>`. Page through `next` Link header (max page size 100).
4. Aggregate `repositories[*].full_name` into a list.

Errors propagate same as `mint_installation_token`.

### `async def _disable_github_installation(self, installation_id: str, *, trigger: str) -> None`

The uninstall chokepoint. Idempotent. Called from:
- The inbound `installation.deleted` webhook handler (`services/integrations/github/uninstall.py::handle_installation_event`).
- The outbound 401/404 detector inside `mint_installation_token`.

Implementation:
1. Look up the installation row by `(provider='github', installation_id)`. If not found, swallow and return (already deleted by a concurrent path).
2. `UPDATE provider_installations SET enabled=FALSE WHERE id=$1` (idempotent — second invocation is a no-op).
3. Invalidate the in-process installation-token cache entry for this `installation_id` (no-op if missing).
4. `INSERT INTO installation_audit_log (tenant_id, installation_row_id, action='uninstall', status='ok', context={trigger})`.
5. Return.

The function MUST NOT raise; if any step fails, log at ERROR with `installation_row_id` and continue (the caller decides whether to retry).

### `class GithubApiError(Exception)`

Wrapping httpx errors. Fields: `status_code`, `code` (GitHub's `code` field if present), `message`, `documentation_url`.

### `class GithubInstallationRevokedError(GithubApiError)`

Subclass raised exclusively by the chokepoint. Callers (e.g., the OAuth callback) catch this to render the "installation revoked, please re-install" path.

## Token cache contract

- Implementation: `dict[str, _CacheEntry]` keyed on `installation_id`, with a `time.monotonic()`-based expiry per entry.
- TTL: `expires_at - now - 60s` safety margin (GitHub issues tokens with 1-hour expiry; we evict 60s early).
- Eviction: on every read, prune expired entries before the lookup. No max size in v1 (installation count is O(100)).
- Thread safety: asyncio is single-threaded; no lock required.
- Invalidation: explicit `invalidate(installation_id)` method called by `_disable_github_installation`.

## Performance budget

| Operation | Cold | Warm |
|---|---|---|
| `mint_installation_token` | < 2s (one round-trip to GitHub) | < 1ms (cache hit) |
| `get_installation_repositories` (all permission) | < 1ms (no API call) | — |
| `get_installation_repositories` (selected, ≤100 repos) | < 2s | — |

## What this client does NOT do (out of scope for IN-13)

- POST comments to PRs / issues.
- Create or update check runs.
- Create issues programmatically.
- Read commit content / blobs.
- Read PR diffs.
- GraphQL API calls.
- Per-repo webhook management.
