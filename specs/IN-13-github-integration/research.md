# Research: IN-13 GitHub Production Integration

## R1 — `selected_repositories` persistence shape

**Question**: Where do we store the curated list of repositories an installation has been granted access to?

**Decision**: Add a single new JSONB column `selected_repositories` to `provider_installations` via migration `0042_provider_installations_selected_repositories.sql`. `NULL` means "all repositories" (matches GitHub App's `repository_selection='all'` permission). A list of `<owner>/<repo>` full names means a curated selection.

**Rationale**: Lookups are point-fetches by `provider_installations.id` (already the primary key); the payload is small (<1 KB even for orgs with thousands of repos — full names are short strings, JSONB compresses well). `provider_installations` does not have an existing `metadata` JSONB column (verified via `\d provider_installations` against the current schema), so we'd have to invent one for one feature.

**Alternatives considered**:
- Sibling table `provider_installation_repositories` keyed on `(installation_row_id, repo_full_name)` — rejected because it duplicates `tenant_id` and `installation_row_id` for no per-repo query advantage in v1 (no per-repo dashboard view, no per-repo audit). Adds RLS surface for no benefit.
- Existing `metadata` JSONB column — does not exist; inventing it is YAGNI and creates ambiguity about namespace ownership.
- Comma-separated TEXT column — rejected; JSONB roundtrips through Python lists naturally via asyncpg's codec.

---

## R2 — GitHub App authentication: JWT minting

**Question**: How do we sign GitHub App JWTs (RS256) without taking on `PyJWT` as a transitive dependency?

**Decision**: Hand-construct compact JWTs using `cryptography.hazmat.primitives` directly. Algorithm:
```
b64url(json({alg='RS256', typ='JWT'})) + '.' + b64url(json({iat, exp=iat+9*60, iss=str(app_id)}))
→ sign over that string with PKCS1v15 + SHA256 over the App's private key
→ append '.' + b64url(signature)
```
This is ~25 LoC in `services/integrations/github/jwt.py` and uses only the `cryptography` package already in the project.

**Rationale**:
- The JWT spec for RS256 is straightforward; we already use `cryptography` for envelope encryption (`lib/shared/secret_store/envelope.py`). Reading another library's wrapper of the same primitives adds attack surface without saving meaningful work.
- The construction is auditable in one place; rotating the algorithm (e.g., to a different padding scheme in v2) is a one-file change.
- The JWT lifetime is 9 minutes (1 min clock-skew margin below GitHub's 10 min max); `exp` and `iat` use Unix epoch seconds (UTC).

**Alternatives considered**:
- `PyJWT[crypto]` — pulls in a transitive layer that mostly does the same construction less transparently; adds a maintenance touch point we don't otherwise need.
- `python-jose` — heavier, includes JWE/JWS surface we don't use.

---

## R3 — Per-installation webhook secret design

**Question**: How do we achieve per-installation webhook signature isolation when GitHub Apps share a single App-level webhook secret across all installations?

**Decision (post-clarify, Clarifications Q1)**: Ship the simpler **single App-level webhook secret + payload-routed tenant isolation** model. The operator persists one shared row in `encrypted_secrets` (label like `github:app:webhook_secret`) at App-registration time. Every inbound webhook verification loads that one secret via `load_secrets(provider='github', tenant_id=None, …)`. Per-tenant isolation is enforced structurally at the resolver layer: `installation.id` payload extraction → `provider_installations` lookup → `tenant_id`. GitHub-row `secret_ref` is left NULL (no per-installation indirection in v1).

**Rationale**:
- GitHub Apps as of 2026 only support a single App-level webhook secret configured in the App's settings page; `PATCH /app/installations/{id}` does NOT accept a `webhook_secret` field. There is no protocol path to a per-installation cryptographic separation. The plaintext is necessarily shared across all installations of the same App; per-installation ciphertext envelope nonces add storage complexity without a security property (both ciphertexts decrypt to the same plaintext, which means an attacker with one tenant's ciphertext can forge with any other tenant's `installation.id`).
- SC-003 (post-clarify) is now phrased structurally: the property is that `installation.id` resolves to exactly one `tenant_id` and the resulting Observation lands under that tenant only. This is enforced by the existing `provider_installations` resolver and the substrate's tenant scoping. The cryptographic-per-tenant property is not required and not promised.
- An attacker who exfiltrates the App secret AND knows a victim's `installation.id` could forge a webhook delivery routing to the victim tenant. This is an explicitly accepted residual risk (spec US3 acceptance §2): the attacker still cannot create new tenant rows, cannot read existing observations, and cannot read GitHub-side data (which requires the installation access token GitHub mints). Operational mitigation is App-secret hygiene.
- When (if) GitHub ships per-installation webhook secrets, the migration is straightforward: change the resolver to load `tenant_id=<resolved>` instead of `None`, set `secret_ref` per row at install time, populate `encrypted_secrets` per-installation. The current spec/data-model leaves that door open without paying any v1 cost.

**Alternatives considered**:
- **Per-installation secret via custom Fyralis-side header**: have GitHub deliver to a Fyralis URL that includes the installation_id, intercept at the gateway, derive the per-installation pepper, and check an additional `X-Fyralis-Installation-MAC` header. Rejected because (a) GitHub doesn't sign Fyralis-defined headers, (b) the additional MAC would need to be computed by an operator-controlled hook that GitHub itself doesn't run, so it's structurally fake.
- **Per-repository webhooks instead of App-level**: GitHub supports per-repo webhooks with per-secret. Rejected because (a) it loses the per-installation lifecycle (installation.deleted does not fire on per-repo webhooks), (b) it requires the customer to configure N webhooks for N repos, breaking the self-serve install flow.
- **Wait for GitHub to ship per-installation secrets before integrating** — rejected; the structural property the spec actually cares about (`installation.id`-driven tenant resolution, structural defense against forgery in the post-resolution path) is achievable today. Shipping v1 with a documented known-limitation is acceptable.

---

## R4 — Replay cache backend: in-process LRU vs Redis

**Question**: Where do we store recent `(installation_id, delivery_id)` pairs for replay detection?

**Decision**: In-process LRU with a 5-minute TTL, max_entries 4 096. No Redis backing.

**Rationale**:
- Spec FR-014 mandates in-process LRU.
- The single FastAPI gateway process holds the cache; cross-process replay state is not durable but observation-layer `(source_channel, external_id)` dedup is the correctness backstop.
- Process restarts during a deploy MAY transiently accept a duplicate delivery — accepted property (Assumption §11). The deduplication on the observation insert catches it.
- The same in-process LRU pattern is already used by `services/webhooks/tenant_resolver.py::InstallationCache` — we copy the OrderedDict + per-entry expiry approach exactly.
- Cache-internal exceptions swallow-and-log; the request proceeds normally (observation-layer dedup is the structural backstop). Metric `github_webhook_replay_cache_bypass_total` increments.

**Alternatives considered**:
- Redis (via `redis.asyncio.Redis`, key prefix `wh:replay:github:`, EX=300) — over-engineered for v1. The cross-process correctness gain is moot because observation-layer dedup runs against the durable substrate.
- Postgres-backed table — same over-engineering criticism; adds a DB round-trip on every delivery.

---

## R5 — Lifecycle event interception: router vs shaper registry

**Question**: Where in the request pipeline do we intercept `installation` and `installation_repositories` events?

**Decision**: At the **router layer** (`services/webhooks/router.py`) AFTER signature verification + tenant resolution succeed, BEFORE the ingestion handler is invoked. The shaper registry in `services/ingestion/handlers/github.py` is UNCHANGED in v1 — it keeps its 6 keys (`pull_request`, `push`, `issues`, `issue_comment`, `pull_request_review`, `check_run`).

**Rationale**:
- Spec FR-015 makes this an explicit requirement.
- Lifecycle events are NOT Observations — they are side-table mutations + audit-log rows. Routing them through the shaper registry would force the shaper to return a sentinel (e.g., `None`) that the router would then have to specially handle — that's a wider blast radius than a 30-line interception branch in the router.
- The router already has provider-specific lifecycle interception precedent: Slack's `app_uninstalled` / `tokens_revoked` events route to `services/integrations/slack/uninstall.py` from inside the router's `receive` function (see `_handle_slack_lifecycle`). Adding a parallel GitHub branch (calling into `services/integrations/github/lifecycle.py`) is the consistent shape.

**Alternatives considered**:
- Route through the shaper registry with `None` return sentinel — wider blast radius; the shaper docstring becomes load-bearing in a way it isn't today.
- Two separate endpoint paths (`/webhooks/github/events` and `/webhooks/github/lifecycle`) — rejected because GitHub delivers everything to one webhook URL; adding a Fyralis-side route split would require operator configuration of two URLs.

---

## R6 — Outbound REST client: minimal foundation vs full product surface

**Question**: How much of an outbound REST client do we ship in v1?

**Decision**: Ship the minimum required for the **uninstall chokepoint** (FR-012) to function: JWT mint + installation-token mint + the common `_request` helper that detects 401/404 and converges on the chokepoint. No product-feature methods (`post_pr_comment`, `create_check_run`, etc.) — those are IN-14+.

**Rationale**:
- The spec scopes outbound product features OUT (Summary, Out of Scope (b)).
- BUT the uninstall chokepoint needs an outbound call site to detect 404 (otherwise outbound 404s would silently spam logs without ever disabling the row, per US4 motivation).
- The minimum call site is `mint_installation_token` itself, which IS called during the OAuth callback (T042). That call site triggers the chokepoint if the installation was already revoked between Fyralis state-token issuance and the callback completing.
- Token caching is in-process dict keyed on `installation_id`. Expiry at `expires_at - 60s` safety margin.

**Alternatives considered**:
- Ship the full outbound surface — out of scope per Summary. Adds tests, adds review surface, doesn't move the receive contract.
- Defer all outbound to IN-14 (no token mint) — breaks US4 acceptance scenario 3 (outbound 401 chokepoint) because there's no outbound call site to detect 401. Rejected; the minimum foundation is correctness-load-bearing.

---

## R7 — Bootstrap PING handling

**Question**: How does GitHub's initial webhook configuration test (`ping` event) verify before any `provider_installations` row exists?

**Decision**: The router intercepts `X-GitHub-Event: ping` AT THE TOP of the github branch, BEFORE tenant resolution. Verifies signature against the env-var fallback `GITHUB_WEBHOOK_SECRET` (dev-only path; FR-022). Returns HTTP 200 with `{handled: 'ping'}`. NO Observation. NO `installation_audit_log` row.

**Rationale**:
- GitHub sends `ping` immediately when the operator configures the App's webhook URL — this happens BEFORE any customer installs the App, so no `provider_installations` row can resolve.
- The env-var fallback is the ONLY path that can verify a ping. In `FYRALIS_ENV=prod`, after the App is registered, the operator should disable `GITHUB_WEBHOOK_SECRET` in prod env — pings will fail verification, which is fine because the App is already registered (pings don't re-occur unless the operator rotates the App's webhook secret).
- This is the same `dev-only fallback` posture as Slack's `WEBHOOK_SECRET_SLACK` env var for first-install bootstrap.

**Alternatives considered**:
- Always require an installation row — rejected because the App can't be registered without a working ping verification, and there's no install row until after registration.
- Have GitHub deliver pings to a separate Fyralis-defined path — rejected; GitHub uses one webhook URL per App.

---

## R8 — Re-install secret rotation

**Question**: When a tenant uninstalls and re-installs, how do we handle the secret material?

**Decision (post-clarify)**: Re-install reuses the existing `provider_installations.id` (UPSERT path), flips `enabled=TRUE`, refreshes `selected_repositories` via the GitHub API, writes audit row `action='reinstall', status='ok'`. No webhook-secret rotation occurs (the App-level secret is unchanged per Q1; `secret_ref` stays NULL on GitHub rows). (FR-006)

**Rationale**:
- Reusing the row id preserves the `installation_audit_log` chain (an analyst can trace install → uninstall → reinstall events for the same logical installation without joining across UUIDs).
- No secret rotation in v1 because there is no per-installation secret to rotate. Old deliveries signed against the App secret remain valid; the existing `(source_channel, external_id)` dedup at the observation layer handles any stale retries (they hit an already-existing row and dedup).
- The IN-09 lock-free uninstall pattern handles concurrent re-install + outbound chokepoint races (FR-013, SC-005).

---

## R9 — Observation-layer dedup vs replay cache

**Question**: How do the `(installation_id, X-GitHub-Delivery)` replay cache and the `(source_channel, external_id)` observation-layer dedup interact?

**Decision**: They are layered defenses with different scopes:
- **Replay cache** (5 min TTL): catches GitHub's at-least-once retry-after-200-but-network-error scenarios. Short-circuits the entire pipeline (no shaper call, no observation INSERT attempt, no `trigger_queue` enqueue). Prevents downstream LLM-pass double-firing.
- **Observation-layer dedup** (durable): catches everything else — GitHub retries after the 5 min window has elapsed, manual replays via the GitHub UI, application-level event repetition (same PR's `node_id` legitimately producing different observations on different actions). Returns `deduped=true` from the INSERT.

The replay cache acts ONLY when both `installation_id` AND `X-GitHub-Delivery` match. Different deliveries (same event payload, different delivery UUIDs from a manual replay) bypass the replay cache and are caught by observation-layer dedup. Same-delivery-id retries within 5 min are caught by the replay cache and never reach the observation layer.

**Rationale**: The post-commit pipeline (think_worker, recommendations, today-bumps) fires on the INSERT path, not the dedup path. Without the replay cache, a re-delivered event would re-trigger downstream work even when the observation insert dedups. The replay cache is the structural guard against that re-firing. (US6 motivation.)

**Alternatives considered**:
- Rely purely on observation-layer dedup — rejected; double-fires downstream as noted.
- Persist the replay cache in Postgres — rejected; in-process LRU is FR-014 and the cost-benefit ratio doesn't justify the DB round-trip.

---

## R10 — Bot-sender filter (spec change vs my plan)

**Question**: The spec was rewritten and the original "filter sender.type=Bot" requirement (my original FR-011) no longer appears explicitly. Does the v1 plan ship bot-sender filtering?

**Decision**: Defer bot-sender filtering to a follow-up task. The current spec FR-015 says the shaper registry is unchanged in v1; adding bot-filter early-returns to the shapers is technically a shape-change that crosses the FR-015 boundary. The spec's loop-prevention property is preserved structurally for IN-13's scope: this feature does NOT ship outbound product features that would create the LLM-feedback-loop risk (no PR-comment auto-reply, no check-run posting). When IN-14+ ships outbound, that task adds the bot-sender filter at the appropriate layer.

**Rationale**:
- The spec was explicit about scope tightening (FR-015 → no shaper registry changes; outbound product features OUT).
- Without outbound, there's no loop to prevent in v1. Bot-originated events (Dependabot PRs, third-party CI bots) DO produce Observations, which is the same behavior as today (the existing handler doesn't filter them). Tenants who want to filter Dependabot can do so via a downstream rule in the think pipeline.

**Alternatives considered**:
- Add the bot-filter as an early-return in every shaper anyway, framed as "preventive hardening for IN-14" — rejected because it crosses FR-015's scope boundary and changes the existing shaper bodies, violating SC-011 (`services/ingestion/handlers/github.py` should be untouched).
- Add the filter at the router layer instead — possible but premature; the router has no current contract to express "drop without producing an observation"; the filtered_repo path is the closest precedent, but it's grounded in customer-facing repo-grant semantics, not bot-vs-human signal hygiene.
