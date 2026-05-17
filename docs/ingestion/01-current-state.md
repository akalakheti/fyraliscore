# Current State of Fyralis Ingestion

**Canonical reference:** `00-system-design.md` is the target architectural intent (non-negotiables N1–N5). This document maps the *gap* between what exists today and that intent. Each risk identified here will be addressed by a milestone in `04-implementation-plan.md` that discharges one or more non-negotiables.

**Scope:** Faithful map of the ingestion code as it exists on branch `integration/ingestion-hardening`, commit `c35c5c8`. No proposed changes in this document — design decisions land in `02-high-level-design.md` after Phase 1 sign-off.

**Frame to set before reading:** the prompt for this exercise references a "backfill ingestion pipeline" — that is what we are designing *toward*. **What exists today is fundamentally not that.** Three of the four sources (Slack, GitHub, Discord) are pure webhook-pushed, forward-only systems with no historical fetch at all. Gmail is the only source with a fetcher, and it is forward-only too (it starts at the `historyId` returned by the first watch). The "current state" sections below describe the live code; Phase 2 will be where the gap to a backfill system is named.

---

## Repository Map

```text
db/migrations/                    44 migrations; 0001 defines `observations`;
                                  0039–0044 define the OAuth substrate
                                  (provider_installations, encrypted_secrets,
                                  installation_audit_log, etc.)
lib/
├── shared/
│   ├── secrets/                  Fernet envelope encryption over encrypted_secrets
│   ├── errors.py                 CompanyOSError hierarchy
│   ├── ids.py                    uuid7
│   ├── tenant_context.py         bind_tenant / tenant_transaction (RLS shim)
│   └── types.py                  ObservationCreate, ObservationRow, TrustTierValue
├── embeddings/ollama.py          Ollama client; 768-dim VECTOR
└── ...
services/
├── ingestion/
│   ├── core.py                   ★ UniformIngestPath — handler → observation insert
│   ├── handlers/                 per-channel shaper functions (registry pattern)
│   │   ├── __init__.py           CHANNEL_TRUST_MAP, @register decorator, ObservationDraft
│   │   ├── github.py             6 event shapers
│   │   ├── slack.py              single `message` shaper
│   │   ├── discord.py            interaction + message shapers
│   │   ├── gmail.py              dispatch + canonicalization + handler
│   │   ├── linear.py, stripe.py, email.py, calendar.py, system.py
│   └── tests/
├── webhooks/
│   ├── router.py                 ★ /webhooks/{provider}/{subpath} entrypoint
│   ├── verifier.py               Verifier Protocol + VerifiedContext
│   ├── signatures/               per-provider verifier classes
│   ├── secrets.py                load_secrets(provider, tenant_id) — DB-backed
│   ├── tenant_resolver.py        DB-backed (provider, payload, headers) → tenant_id
│   ├── tenant_resolution.py      legacy resolver, still imported in places
│   ├── gmail_pubsub.py           OIDC-verified Pub/Sub push endpoint
│   ├── metrics.py                in-process counters
│   └── ...
├── integrations/
│   ├── router.py                 build_integrations_router() — OAuth callbacks
│   ├── github/                   oauth, jwt, client, lifecycle, uninstall,
│   │                             replay_cache, metrics
│   ├── slack/                    oauth, client, uninstall, metrics
│   ├── discord/                  oauth, client, commands, uninstall, metrics,
│   │   └── gateway/              websocket worker + dispatch (IN-12)
│   ├── gmail/                    oauth, client, fetcher, history_poller,
│   │                             push_handler, watch, watch_scheduler, dwd,
│   │                             pubsub, directory, threading, audit, optout,
│   │                             status_api, uninstall
│   └── tests/
├── observations/
│   ├── repo.py                   ObservationRepository.insert (idempotent)
│   └── events.py                 NOTIFY observations_new emission (post-commit)
├── actors/                       actor resolution
├── entity_aliases/               fast-path entity extraction
└── gateway/main.py               FastAPI app wiring + lifespan deps
scripts/
└── run_discord_gateway_worker.py Long-running Discord Gateway worker
specs/IN-13-github-integration/   Latest feature plan (referenced in CLAUDE.md)
```

There is **no `bench/` or `services/workers/` directory that runs a backfill pipeline.** All four "ingestors" are some combination of FastAPI route + signature verifier + handler function; Gmail additionally has scheduled coroutines (`history_poller.run_forever`, `watch_scheduler.run_forever`) and a Pub/Sub push endpoint.

---

## Per-Source Analysis

### Slack

- **Entry point:** webhook only — [services/webhooks/router.py:342-347](services/webhooks/router.py#L342-L347) → ingest at [services/ingestion/handlers/slack.py:160](services/ingestion/handlers/slack.py#L160).
- **Auth:** Bot token from Slack OAuth response stored via `secret_store.put(..., label=f"slack_bot_token:{team_id}", tenant_id=tenant_id)` at [services/integrations/slack/oauth.py:375-379](services/integrations/slack/oauth.py#L375-L379). Signing secret from `SLACK_SIGNING_SECRET` env stored under label `"slack_signing_secret:app"` at [services/integrations/slack/oauth.py:400-404](services/integrations/slack/oauth.py#L400-L404). **No token refresh logic anywhere** — `expires_in` from the Slack response is not parsed.
- **Pagination:** Not applicable — webhook is push-event, one event per request.
- **Rate limiting:** Outbound only. [services/integrations/slack/client.py:160-173](services/integrations/slack/client.py#L160-L173) honors `Retry-After` on 429, retries up to 3 times within a 30s wall budget, then raises `SlackApiError`. Inbound has none.
- **Raw storage:** None outside `observations.content`. Handler passes `raw_payload=payload` at [services/ingestion/handlers/slack.py:228](services/ingestion/handlers/slack.py#L228), but **the core never persists it** — see "Raw payload contract is documented but not implemented" under Cross-Cutting Risks.
- **Idempotency key:** `external_id = f"{channel_id}:{ts}"` at [services/ingestion/handlers/slack.py:207](services/ingestion/handlers/slack.py#L207). Slack's `ts` is microsecond-unique per channel and stable across edits/retries — **this is a source-native stable key, correct.**
- **Failure modes:**
  - Invalid signature → 401 via `_err_response` at [services/webhooks/router.py:421-422](services/webhooks/router.py#L421-L422).
  - Unknown installation → 401, `team_id` never logged (per FR-023) at [services/webhooks/router.py:502-508](services/webhooks/router.py#L502-L508).
  - Unsupported event (no `text`) → 400 `ValidationError` at [services/ingestion/handlers/slack.py:184-189](services/ingestion/handlers/slack.py#L184-L189).
  - DB transient error → **uncaught**, propagates to FastAPI as 500, relies on Slack's 3-retry policy.
  - Ollama failure → caught, observation persisted with `embedding_pending=TRUE` at [services/ingestion/core.py:232-234](services/ingestion/core.py#L232-L234).
- **Cursor persistence:** None. Webhook-only.
- **Backfill model:** **None.** A workspace installed today will not see messages sent yesterday. The spec language at IN-08 ("when the workspace sends its *first new* message…") confirms this is by design.
- **Lifecycle:** `app_uninstalled` and `tokens_revoked` routed BEFORE ingestion at [services/webhooks/router.py:539-547](services/webhooks/router.py#L539-L547); handlers disable the row, zeroize secrets, write audit, return 200. Concurrent uninstalls are idempotent — `secret_store.delete()` suppresses not-found.
- **Recognised events:** **`message` with a `text` field, period.** No `message_changed`, `message_deleted`, `reaction_added`, `app_mention`, `channel_join`, file events, thread events, or app-home opens.

---

### GitHub

- **Entry point:** webhook only — same `/webhooks/{provider}/...` route; handler at [services/ingestion/handlers/github.py:485-507](services/ingestion/handlers/github.py#L485-L507).
- **Auth:** App-level webhook secret (shared across all installations, **not per-tenant**) — see [services/integrations/github/__init__.py:5-7](services/integrations/github/__init__.py#L5-L7) and [services/integrations/github/uninstall.py:10](services/integrations/github/uninstall.py#L10). App private key read **from env on every JWT mint** ([services/integrations/github/jwt.py:33-70](services/integrations/github/jwt.py#L33-L70)); supports `GITHUB_APP_PRIVATE_KEY` or `GITHUB_APP_PRIVATE_KEY_PATH`. Installation access tokens cached in-process per `installation_id` with 60s near-expiry revalidation ([services/integrations/github/client.py:47, 91, 139-143](services/integrations/github/client.py#L47)). Cache invalidated on 401/404 chokepoint at [services/integrations/github/uninstall.py:134-135](services/integrations/github/uninstall.py#L134-L135).
- **Pagination:** Only `list_installation_repositories` at OAuth callback time. **Hardcoded 3-page cap (~90 repos)** at [services/integrations/github/client.py:251-317](services/integrations/github/client.py#L251-L317). Truncation surfaces via `_last_repos_truncated` and an audit-log note. No cursor persistence — this runs once per install.
- **Rate limiting:** Outbound client detects 429 and raises `GithubApiError(code='github_api_rate_limited')` with the `Retry-After` echoed in context ([services/integrations/github/client.py:442-450](services/integrations/github/client.py#L442-L450)). **No automatic backoff or retry** — callers decide.
- **Raw storage:** None outside `observations.content` JSONB. Each shaper builds a structured `content` dict; raw body bytes are discarded after verification.
- **Idempotency key:** **GitHub `node_id` for every event that has one** — see the shaper table:

  | Event | external_id formula | Location |
  |---|---|---|
  | `pull_request` | `pr.node_id` | [handlers/github.py:216](services/ingestion/handlers/github.py#L216) |
  | `push` | `f"{repo_full}@{after}"` | [handlers/github.py:256](services/ingestion/handlers/github.py#L256) |
  | `issues` | `issue.node_id` | [handlers/github.py:304](services/ingestion/handlers/github.py#L304) |
  | `issue_comment` | `comment.node_id` | [handlers/github.py:352](services/ingestion/handlers/github.py#L352) |
  | `pull_request_review` | `review.node_id` | [handlers/github.py:415](services/ingestion/handlers/github.py#L415) |
  | `check_run` | `check.node_id` | [handlers/github.py:461](services/ingestion/handlers/github.py#L461) |

  `node_id` is GitHub's globally stable GraphQL identifier — **the right choice.** `X-GitHub-Delivery` is logged for audit only ([router.py:122-126](services/webhooks/router.py#L122-L126)) and explicitly not used as dedup.
- **Failure modes:**
  - Invalid signature → 401.
  - Replay (same `X-GitHub-Delivery` within 5 min) → 200 `{"handled":"replay"}` at [services/webhooks/router.py:483-497](services/webhooks/router.py#L483-L497).
  - Unknown installation → 401, deferred until *after* signature verification (FR-023).
  - Unsupported event → handler's `_EVENT_SHAPERS.get(event_type)` returns None → `ValidationError` → 400.
  - Lifecycle events (`installation`, `installation_repositories`) routed BEFORE the handler at [router.py:553-566](services/webhooks/router.py#L553-L566); never reach `_EVENT_SHAPERS`.
  - `selected_repositories` filter: deliveries for unlisted repos → 200 `{"handled":"filtered_repo"}` at [router.py:571-591](services/webhooks/router.py#L571-L591).
  - DB transient error → propagates uncaught (same as Slack).
  - Ollama failure → `embedding_pending=TRUE`.
- **Cursor persistence:** None. Pure webhook; relies on GitHub's at-least-once retry and the observation-layer dedup.
- **Replay cache:** In-process LRU keyed on `(installation_id, X-GitHub-Delivery)`, TTL 300 s, capacity 4096. Consulted **after signature verification, before unknown-installation enforcement**. Internal exceptions return `False` (allow) and bump `_bypass_count` — defense-in-depth, not a correctness gate. See [services/integrations/github/replay_cache.py:19-88](services/integrations/github/replay_cache.py#L19-L88).
- **Backfill model:** **None.** OAuth callback calls `list_installation_repositories` once to seed the allowlist; **no historical issues, PRs, pushes, comments, or check runs are fetched.** Forward-only from install.
- **Lifecycle events handled:** `installation.{created,deleted,suspend,unsuspend}` and `installation_repositories.{added,removed}` — state-only, no observation produced. See [services/integrations/github/lifecycle.py:48-54](services/integrations/github/lifecycle.py#L48-L54).
- **Recognised event types in the observation handler:** **only 6.** No `release`, `deployment`, `workflow_run`, `workflow_job`, `discussion`, `discussion_comment`, `commit_comment`, `member`, `team_add`, `repository`, `branch_protection_rule`, `code_scanning_alert`, etc. Anything outside the 6 is rejected with `ValidationError("unsupported github event type")` at [services/ingestion/handlers/github.py:494-498](services/ingestion/handlers/github.py#L494-L498).

---

### Discord

Discord has **two ingestion paths** that operate independently and share no state.

#### (a) HTTP interactions (slash commands, components, modals)

- **Entry point:** same `/webhooks/{provider}/...` route. Handler at [services/ingestion/handlers/discord.py:115-158](services/ingestion/handlers/discord.py#L115-L158).
- **Auth:** Ed25519 public key. Verified via PyNaCl at [services/webhooks/signatures/discord.py:55-143](services/webhooks/signatures/discord.py#L55-L143). Public key mirrored per-guild in `encrypted_secrets` under `discord_public_key:{guild_id}`; app-level fallback in `WEBHOOK_SECRET_DISCORD` env for the bootstrap PING.
- **Idempotency key:** `external_id = f"discord:{interaction_id}"` ([handlers/discord.py:151-155](services/ingestion/handlers/discord.py#L151-L155)). Discord interaction IDs are snowflakes.
- **Credential stripping:** the per-interaction follow-up `token` is removed from the payload before storage at [services/ingestion/handlers/discord.py:48-66](services/ingestion/handlers/discord.py#L48-L66).
- **PING (type=1):** returns `{type:1}` at [router.py:448-449](services/webhooks/router.py#L448-L449), no observation.
- **ApplicationCommand (type=2):** returns ephemeral confirmation at [router.py:671-682](services/webhooks/router.py#L671-L682). The real Fyralis answer is supposed to ship via follow-up message but the body text says "Follow-up content ships in IN-13" — **the follow-up is not yet implemented.**

#### (b) Gateway WebSocket worker (real-time messages)

- **Entry point:** long-running process spawned by [scripts/run_discord_gateway_worker.py:98](scripts/run_discord_gateway_worker.py#L98).
- **Auth:** Bot token from `DISCORD_BOT_TOKEN` env at [scripts/run_discord_gateway_worker.py:46](scripts/run_discord_gateway_worker.py#L46). **App-level, not per-installation** — one bot for the whole platform.
- **Intents subscribed:** `GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT` (bitmask 33281) at [services/integrations/discord/gateway/client.py:48-52](services/integrations/discord/gateway/client.py#L48-L52). MESSAGE_CONTENT is a Discord-privileged intent and must be enabled in the developer portal.
- **Connect/resume flow:** outer loop at [client.py:172-207](services/integrations/discord/gateway/client.py#L172-L207). Close code → action mapping at [client.py:66-69](services/integrations/discord/gateway/client.py#L66-L69):
  - **Resumable** (1006, 4000, 4001, 4002, 4005, 4008) → reconnect + RESUME with cached `session_id` and `seq`.
  - **Full re-IDENTIFY** (4003, 4007, 4009) → discard session, fresh IDENTIFY.
  - **Fatal** (4004, 4010–4014) → `FatalGatewayError`, process exits 1; **no supervisor auto-restart in the worker itself**.
- **Resume state persistence:** **in-memory only** ([client.py:94-102](services/integrations/discord/gateway/client.py#L94-L102)). On worker crash, `session_id` and `last_seq` are lost; the next connection IDENTIFIES fresh. Discord's resume window is short — anything delivered between crash and restart is gone unless the observation layer's dedup absorbs a retransmission, which Discord generally does not do.
- **Dispatch:** [services/integrations/discord/gateway/dispatch.py:58-80](services/integrations/discord/gateway/dispatch.py#L58-L80). Only `MESSAGE_CREATE` is ingested; `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `TYPING_START`, etc. are dropped silently (metric only).
- **Idempotency key:** `external_id = f"discord:{message_id}"` at [handlers/discord.py:269](services/ingestion/handlers/discord.py#L269). Message IDs are snowflakes — source-native stable.
- **Guild ID redaction:** `guild_id` is NEVER stored in queryable columns; only a BLAKE2b short hash lands in `content.metadata.short_guild_hash` ([handlers/discord.py:196-209](services/ingestion/handlers/discord.py#L196-L209)). The raw `guild_id` is still inside `payload` and the handler does not redact it from `content`/`raw_payload` — verify whether `content` actually echoes the raw guild id; the agent claim is that only the hash lands but the raw payload still contains it.
- **Sharding:** none. Single connection per bot.
- **Cross-channel dedup:** interactions use `source_channel="discord:interaction"`, gateway messages use `source_channel="discord:message"`. The dedup UNIQUE is on `(source_channel, external_id, occurred_at)` — **the two never collide.** Whether that is the intended behavior is an open question.
- **Uninstall detection:** **no inbound webhook event from Discord when a bot is kicked.** Detected only via outbound 401/403 chokepoint at [services/integrations/discord/client.py:226-247](services/integrations/discord/client.py#L226-L247) → `_disable_and_zeroize_discord` at [services/integrations/discord/uninstall.py:40-159](services/integrations/discord/uninstall.py#L40-L159). If no outbound call is ever made (bot just listens), an uninstall goes undetected until a follow-up message attempt fails.
- **Rate limiting:** outbound REST honors 429/`Retry-After` ([client.py:207-224](services/integrations/discord/client.py#L207-L224)); Gateway connection itself has no per-request limits.
- **Backfill model:** **None.** The Gateway worker starts streaming forward from the moment the WebSocket connects. Messages sent before the bot joined or before the worker started are invisible. Per [services/integrations/discord/commands.py:8](services/integrations/discord/commands.py#L8), "a one-time bootstrap was rejected because it breaks the self-serve contract."

---

### Gmail

Gmail is the structurally different source — it has a real fetch/poll pipeline.

- **Entry points (four):**
  1. **OAuth install** at [services/integrations/gmail/oauth.py:151-218](services/integrations/gmail/oauth.py#L151-L218) → triggers async `_provision_install` at [oauth.py:221-315](services/integrations/gmail/oauth.py#L221-L315), which resolves inclusion (users / groups / org units), upserts pending watch rows, and activates each watch.
  2. **Pub/Sub push** at [services/webhooks/gmail_pubsub.py:71-117](services/webhooks/gmail_pubsub.py#L71-L117) — OIDC-token verified, decodes the envelope at [services/integrations/gmail/push_handler.py:46-66](services/integrations/gmail/push_handler.py#L46-L66), then drains.
  3. **History poller** at [services/integrations/gmail/history_poller.py:132-148](services/integrations/gmail/history_poller.py#L132-L148) — 60 s tick, leases up to 50 mailboxes per tick via `FOR UPDATE SKIP LOCKED`, 10 min minimum between polls per mailbox. **In-process asyncio loop, not Temporal, not cron.**
  4. **Watch scheduler** at [services/integrations/gmail/watch_scheduler.py:201-219](services/integrations/gmail/watch_scheduler.py#L201-L219) — 15 min tick, renews watches expiring within 24 h (Gmail watches expire after 7 days). 5-failure threshold → state='errored'.
- **Auth:**
  - **DWD (Domain-Wide Delegation):** service-account private key loaded once per process from `GMAIL_SERVICE_ACCOUNT_JSON_FILE` or env at [services/integrations/gmail/dwd.py:82-121](services/integrations/gmail/dwd.py#L82-L121). RS256-signed JWT exchanged for impersonated user tokens at [dwd.py:162-195](services/integrations/gmail/dwd.py#L162-L195). Tokens cached in-process by `(service_account, user_email, frozenset(scopes))`, TTL with 5-minute headroom; invalidated on 401 at [dwd.py:197-200](services/integrations/gmail/dwd.py#L197-L200).
  - **User OAuth refresh tokens are never persisted** ([dwd.py:26](services/integrations/gmail/dwd.py#L26)).
  - **Pub/Sub authentication:** same DWD minter, self-impersonated (`sub == iss`), scope `https://www.googleapis.com/auth/pubsub` ([services/integrations/gmail/pubsub.py:42, 140-143](services/integrations/gmail/pubsub.py#L42)). Push endpoint is OIDC-token-protected; audience is the push URL.
- **Pagination & cursor:**
  - **History cursor:** `gmail_mailbox_watches.history_id` ([db/migrations/0031_gmail_integration.sql:96](db/migrations/0031_gmail_integration.sql#L96)). One per (install, email).
  - **Page loop** at [fetcher.py:91-111](services/integrations/gmail/fetcher.py#L91-L111) — walks `history.list` pages, accumulates `messagesAdded` IDs.
  - **⚠ Cursor advancement is in a SEPARATE transaction from message inserts.** Verified: step 3 (per-message dispatch) commits each observation in its own `dispatch_gmail_message_resource` call at [fetcher.py:132-141](services/integrations/gmail/fetcher.py#L132-L141); the read-audit row is in *yet another* per-message transaction at [fetcher.py:157-165](services/integrations/gmail/fetcher.py#L157-L165); the cursor advance is in *another* `tenant_transaction` at [fetcher.py:168-194](services/integrations/gmail/fetcher.py#L168-L194). **A crash between step 3 and step 4 leaves the cursor stale.** On next poll, the same messages are re-fetched and the observation-layer dedup catches them (`UNIQUE(source_channel, external_id, occurred_at)`). **No data loss, but the cursor is not crash-atomic with the inserts.** This is the inverse shape of the target architecture's "cursor advancement is a separate Temporal activity" mandate — the goal there is to ensure the cursor advances *only after* data is durable, which is the property this code happens to provide by accident.
- **Rate limiting:** Outbound HTTP 429 / 403 quota errors raised as `GoogleRateLimited(retry_after_s=...)` at [services/integrations/gmail/client.py:124-149](services/integrations/gmail/client.py#L124-L149). Pollers / scheduler increment a per-mailbox failure counter; 5 consecutive → state='errored', no automatic recovery. Push handler returns 200 on rate-limit so Pub/Sub doesn't redeliver storm.
- **Raw storage:** Same as the others — no RFC 822, no Gmail-API JSON blob stored. Selected headers, body (if `gmail.readonly`), snippet, labels, threadId, mailbox_email, scope_used, read_path are flattened into `observations.content` at [handlers/gmail.py:198-220](services/ingestion/handlers/gmail.py#L198-L220).
- **Idempotency key:** **`external_id = f"gmail:{gmail_installation_id}:{rfc5322_message_id}"`** at [handlers/gmail.py:235](services/ingestion/handlers/gmail.py#L235), with `message_id` extracted from the **RFC 5322 `Message-ID` header** (stripped of angle brackets) at [handlers/gmail.py:180-184](services/ingestion/handlers/gmail.py#L180-L184). Missing header → `ValidationError`. **This is the correct stable identifier** — globally unique across mailboxes, survives label moves, survives mailbox-internal id churn. The brief specifically warned about "Gmail's internal `id`"; that warning does not apply to this codebase.
- **Threading:** RFC 5322 `Message-ID → In-Reply-To → References` chain canonicalised into `gmail_threads_canonical` + `gmail_thread_members` at [services/integrations/gmail/threading.py:118-237](services/integrations/gmail/threading.py#L118-L237). Out-of-order arrivals (child before parent) become their own root and are marked `content._orphan_thread=true`; **they are not retroactively merged** when the parent arrives. Documented at [threading.py:32-36](services/integrations/gmail/threading.py#L32-L36).
- **Multi-user mapping:** one `gmail_installations` row per (tenant, workspace_domain); N `gmail_mailbox_watches` rows per install (one per resolved email). A single message arriving in 10 mailboxes hits the observation dedup nine times after the first inserts — design is sound.
- **Watch renewal:** scheduled separately; failure → state='errored' after 5 consecutive failures with no automatic recovery path. **If renewal fails silently and the watch expires before manual intervention, the poller picks up the gap on its 10-minute cycle** — but only if the watch is still leasable. State='errored' watches are not re-leased.
- **Backfill model:** **Forward-only.** First `gmail.watch()` returns a `historyId`; that is the starting bookmark. Everything before is invisible. The four entry points all funnel into the same `drain_mailbox_history`. There is no "fetch the last N days on install" path.
- **Failure modes:**
  - OAuth `invalid_grant` from DWD exchange → `DwdError` raised, request fails, no automatic recovery.
  - Pub/Sub with stale `historyId` (404 from Gmail) → caught, log + 200 to Pub/Sub at [push_handler.py:113-114, 121-123](services/integrations/gmail/push_handler.py#L113-L114).
  - Crash mid-page → cursor unchanged, re-fetched on next tick, dedup catches.
  - Quota exceeded → 5-failure counter, state='errored', manual intervention.
  - Single-message fetch 404 → log warning, skip, cursor still advances.
  - DB transient error in step 4 → cursor advance fails, observations persisted, re-fetch on next tick, dedup catches.

---

## Cross-Cutting Observations

### Uniform path
[services/ingestion/core.py:122-344](services/ingestion/core.py#L122-L344) is the single chokepoint all four sources eventually flow through. Steps: handler extract → pre-assign uuid7 → actor resolve → fast-path entity extraction → Ollama embed → INSERT inside transaction + `think_trigger_queue` enqueue in the *same* transaction → post-commit `NOTIFY observations_new`. The atomicity here is genuinely correct: observation row, think trigger, and notification are bound together; partial state is not possible.

### Handler registry
Module-level dict populated at import time via `@register(channel)` ([handlers/__init__.py:103-139](services/ingestion/handlers/__init__.py#L103-L139)). `CHANNEL_TRUST_MAP` at [handlers/__init__.py:41-68](services/ingestion/handlers/__init__.py#L41-L68) — authoritative source for trust tier per channel. Trust tier in the observation can be overridden by the handler (e.g., GitHub `pull_request_review.approved` → `authoritative` vs `comment` → `inferential`).

### Observations schema
[db/migrations/0001_foundation.sql:65-95](db/migrations/0001_foundation.sql#L65-L95). Partitioned by `occurred_at` RANGE. `embedding VECTOR(768)`, `embedding_pending BOOLEAN`, `external_id TEXT` (nullable). UNIQUE constraint: `(source_channel, external_id, occurred_at)`. Since SQL NULL ≠ NULL, **observations with NULL external_id are not deduplicated** — any handler that returns `external_id=None` will produce a fresh row on every call.

### Tenant resolution
DB-backed resolver at [services/webhooks/tenant_resolver.py:255-295](services/webhooks/tenant_resolver.py#L255-L295). Per-provider extractor functions:
- Slack: `payload.team_id`
- GitHub: `payload.installation.id`
- Discord: `payload.guild_id` (HTTP and Gateway), `payload.application_id` fallback (HTTP-only)
- Linear: `payload.organizationId`
- Stripe: `Stripe-Account` header

Outcomes: `Resolved | UnknownInstallation | PayloadMissing` ([tenant_resolver.py:92-130](services/webhooks/tenant_resolver.py#L92-L130)). `UnknownInstallation` does **not** distinguish "never installed" from "disabled" (deliberate — no existence enumeration). **A legacy `tenant_resolution.py` still exists in the repo** — the new resolver is `tenant_resolver.py`; the legacy file is imported in places that the IN-08 migration did not cut over.

### Signature verifiers
Single `Verifier` Protocol at [services/webhooks/verifier.py:123-159](services/webhooks/verifier.py#L123-L159). Registry at [services/webhooks/signatures/__init__.py:31-37](services/webhooks/signatures/__init__.py#L31-L37). All verifiers iterate `secrets: Sequence[Secret]` and accept the first match — rotation overlap works by extending that sequence.

### Secret store
Single app-level Fernet MKEK from `MASTER_KEK` env (or one-shot generated in dev). Per-row in `encrypted_secrets`; per-tenant isolation enforced via `WHERE tenant_id = $2` + RLS. **There is no per-tenant key isolation** — compromise of MKEK compromises all tenants' secrets. Construction at [lib/shared/secrets/__init__.py:80-127](lib/shared/secrets/__init__.py#L80-L127).

### Think trigger queue
[db/migrations/0004_think_trigger_queue.sql:24-45](db/migrations/0004_think_trigger_queue.sql#L24-L45). Enqueue is inside the observation insert transaction ([core.py:312-339](services/ingestion/core.py#L312-L339)) — atomic. Consumer is not in scope of this audit; the index `think_trigger_queue_ready_idx` and the `locked_by/locked_at` columns imply a Postgres-table-as-queue pattern with `FOR UPDATE SKIP LOCKED` leasing.

### NOTIFY
Channel `observations_new` ([services/observations/events.py:49-80](services/observations/events.py#L49-L80)). Buffered in a `ContextVar` during the transaction, emitted on a *separate* fresh connection after commit so listeners see committed rows. No listener registry was named by the cross-cutting agent; downstream consumers (entity resolver worker, etc.) presumably LISTEN on it but were not located.

### Observability
- **Logging:** `structlog` is the standard. No enforced field schema, but `provider`, `reason`, `code`, `delivery_id`, `short_guild_hash` are commonly used.
- **Metrics:** in-process thread-safe counters/dicts in `services/webhooks/metrics.py` and per-integration `metrics.py` files. **No Prometheus client wired.** No metrics scraping endpoint. The metrics exist only as in-process state usable for tests.
- **Tracing:** **none.** No `opentelemetry-*` package in `pyproject.toml`; no spans anywhere.

### Failure isolation / DLQ
- **There is no DLQ for ingestion failures.** Handler `ValidationError` returns 400 to the webhook sender; the failed event is **not** persisted anywhere. The model re-evaluation queue has a `model_reeval_dead_letter` table ([0008](db/migrations/0008_think_runs_applied_triggers_dead_letter.sql#L114-L132)) but that is for the Think consumer, not for ingestion.
- **Embedding failures** are the only "soft failure" mode — `embedding_pending=TRUE` queues for later retry, but **no worker was located that scans for `embedding_pending=TRUE` rows.**

### Project structure / dependencies (`pyproject.toml`)

**Present:** asyncpg, pgvector, pydantic v2, fastapi, uvicorn, httpx, websockets, structlog, anthropic, openai, pynacl, cryptography, pyjwt[crypto], zstandard, google-auth, respx (test).

**Notably absent (vs. the target architecture):**
- **Temporal SDK** — no workflows. Long-running work is `asyncio.create_task` loops (`history_poller.run_forever`, `watch_scheduler.run_forever`).
- **Kafka** (any client) — `think_trigger_queue` and Pub/Sub are the only queues in use.
- **aioboto3 / S3** — no raw-tier blob storage.
- **redis-py** — no distributed cache; in-process Python dicts only (replay cache, installation token cache, DWD token cache, tenant resolver cache).
- **orjson** — standard library `json` is used everywhere. Hot-path performance penalty is real but probably not the binding constraint today.
- **opentelemetry-*** — no tracing.
- **confluent-kafka-python** — same as above.
- **prometheus-client** — metrics counters are in-process only.

---

## Identified Risks (ordered by severity)

1. **No backfill of any kind for Slack/GitHub/Discord, and only forward-from-first-`historyId` for Gmail.** This is the headline gap relative to the prompt's target architecture. The current system *cannot* answer "what was happening in this org before they connected Fyralis" for any source. The product implication is severe: a new customer's "feels onboarded" moment is necessarily delayed by however long it takes their team to produce enough live events. Every section above repeats this; it's listed once here as the top risk.

2. **Gmail cursor advances in a separate transaction from message inserts.** Verified at [fetcher.py:132-194](services/integrations/gmail/fetcher.py#L132-L194). The system is safe because the cursor lags the inserts (re-fetch + observation dedup absorbs the gap), but this is **structurally the wrong shape** for what the target architecture mandates ("cursor advancement is a separate Temporal activity from page fetch — never collapsed into one step"). The current code is *accidentally* doing the right thing because the order is (insert → audit-per-message → advance cursor) and dedup is keyed on a stable RFC 5322 identifier. If anyone refactors `drain_mailbox_history` and inverts the order (advance cursor, then insert), data loss becomes possible.

3. **Discord Gateway session state is in-memory only.** [client.py:94-102](services/integrations/discord/gateway/client.py#L94-L102). Worker crash mid-session loses `session_id` and `last_seq`. The next IDENTIFY is fresh; Discord does not redeliver messages from the crash window. **Messages delivered between worker crash and worker restart are dropped silently.** No metric, no audit trail. Mitigation requires persisting `session_id`/`seq` to Postgres or Redis on each frame (or batched).

4. **Watch renewal failure has no recovery path.** Gmail watch scheduler [watch_scheduler.py:174](services/integrations/gmail/watch_scheduler.py#L174) — 5 failures → state='errored', no automatic retry, no operator alert wired in. If a watch expires and renewal stays failed, the mailbox stops generating Pub/Sub events; the poller will also fail to re-lease an `errored` watch ([history_poller.py:56](services/integrations/gmail/history_poller.py#L56) leases on `state='active'`), so coverage drops to zero with **no inbound visibility**.

5. **No DLQ for ingestion failures.** Handler `ValidationError` → 400 → the event is gone. For webhook sources, the provider's retry policy is the only safety net (Slack: 3 attempts, Discord: depends on event, GitHub: 5 attempts over ~1 hour). For Gmail, single-message-fetch 404s skip silently ([fetcher.py:125-130](services/integrations/gmail/fetcher.py#L125-L130)); no record of the skipped message is persisted.

6. **`embedding_pending=TRUE` has no scanner.** A retry worker that re-tries pending embeddings was not located. If Ollama is down for a sustained period, all observations during that window land with `embedding_pending=TRUE` and never get embedded — and retrieval skips pending rows ([repo.py:398-399](services/observations/repo.py#L398-L399)). Verify before Phase 2 whether such a worker exists elsewhere; if not, this is an unbounded backlog.

7. **`raw_payload` contract documented but not implemented.** [handlers/__init__.py:22-23](services/ingestion/handlers/__init__.py#L22-L23) docstring says "ingestion stores this in `content["_raw"]`". [core.py:237](services/ingestion/core.py#L237) copies only `dict(draft.content)` — `draft.raw_payload` is consumed nowhere. Handlers (Slack, Discord, GitHub) populate `raw_payload` on the draft, but the field is dropped on the floor. **Effect:** replay-from-raw is impossible today. The "raw tier" concept from the target architecture does not exist even at a single-row level, let alone in object storage.

8. **No rate limiter substrate.** Each integration's outbound client honors 429 / `Retry-After` independently ([slack/client.py:160-173](services/integrations/slack/client.py#L160-L173), [github/client.py:442-450](services/integrations/github/client.py#L442-L450), [discord/client.py:207-224](services/integrations/discord/client.py#L207-L224), [gmail/client.py:124-149](services/integrations/gmail/client.py#L124-L149)). There is no shared token-bucket, no per-tenant bucketing, no per-method bucketing, and no global view of rate-limit headroom. Two concurrent installs can each consume the full per-tenant Slack budget without coordinating.

9. **Slack handler accepts `message` only — silently drops everything else.** [services/ingestion/handlers/slack.py:184-189](services/ingestion/handlers/slack.py#L184-L189). No edits, deletes, reactions, joins, app-mentions, threading metadata. For an organizational-intelligence product this is a significant data-coverage gap. Same shape applies to GitHub (6 event types out of dozens) and Discord (`MESSAGE_CREATE` only on the Gateway side; HTTP interactions are the full set).

10. **No per-tenant key isolation in the secret store.** Single app-level `MASTER_KEK`. Compromise of one process's memory exposes every tenant's tokens. Acceptable for v1 but the target architecture has no language about this either way; flagging because the prompt called for failure isolation.

11. **`unknown_installation` and disabled-installation are collapsed.** Deliberate design choice (FR-005, no enumeration), but it also means an operator debugging a customer issue cannot tell from a 401 alone whether the install was never created or was deliberately disabled. The audit log resolves it post-hoc, but the 401 response is opaque.

12. **Two tenant resolver files exist** — `tenant_resolver.py` (new, DB-backed) and `tenant_resolution.py` (legacy). The router uses the new one; some other code paths may import the old one. Risk is low (dead code), but it is a smell.

13. **Single-shard Discord Gateway worker.** [client.py](services/integrations/discord/gateway/client.py). At Discord's stated guild-count-per-shard guidance (~2500), a single worker is fine. At larger scales the bot must shard. Not a problem today; flag for capacity planning.

14. **No backfill for OAuth-revoke + reinstall cycles.** If a customer uninstalls and reinstalls a week later, all four sources start forward from the moment of reinstall. The week's data is gone unless the source itself retains it (Slack: yes for messages within retention; GitHub: PRs/issues persist but events are ephemeral; Discord: ephemeral; Gmail: yes via `historyId` if not too old). No code path attempts to bridge the gap.

15. **Discord guild-id leakage risk in `content`/`raw_payload`.** Handler computes `short_guild_hash` for `content.metadata` but does not strip the raw `guild_id` from the rest of the payload that lands in `content`. Verify in Phase 2 whether the raw guild id ends up in stored JSONB despite the agent's claim that "guild_id is never persisted" — the hash claim is for `entities_hint`/`metadata`, not the full content blob.

---

## Open Questions

The following I could not determine confidently from the code alone and need you to confirm or correct before Phase 2:

1. **Is there an `embedding_pending=TRUE` retry worker anywhere in the repo?** The Gmail/Slack/etc. agents could not locate one. If it exists, where?
2. **Is `tenant_resolution.py` (the legacy file) imported by any live code path, or is it dead code that can be removed?** If live, where?
3. **What is the intended retention / lifecycle for `installation_audit_log` rows?** They are append-only and unbounded.
4. **Is the Discord Gateway worker run by exactly one process across the deployment, or is it per-pod with a sharding plan?** [scripts/run_discord_gateway_worker.py](scripts/run_discord_gateway_worker.py) implies single-process; a multi-process deployment would IDENTIFY twice and cause Discord to disconnect both.
5. **What is the deployment topology for the Gmail `history_poller.run_forever` and `watch_scheduler.run_forever` loops?** They appear to be in-process asyncio coroutines but it is not clear which service hosts them (gateway? a separate worker process?). Concurrent runs on multiple pods would compete on `FOR UPDATE SKIP LOCKED`, which is fine; the question is whether the deployment is intentional.
6. **The prompt mentions the Bridge Layer reading "progress signals."** I found no code that emits progress signals other than `installation_audit_log` rows and metrics counters. Is there a planned schema (`onboarding_runs`, `onboarding_shards`, `ingestion_failures`) that does not yet exist, or is this purely greenfield in Phase 2/3?
7. **Is `selected_repositories` the intended primary mechanism for per-installation scope, or is it specifically a GitHub feature?** Slack/Discord/Gmail have no parallel column — does the design assume one?
8. **The `dispatch_gmail_message_resource` path bypasses the standard `ingest()` entry point at [handlers/gmail.py:259+](services/ingestion/handlers/gmail.py#L259).** Confirm whether this is intentional and what invariants it must preserve relative to the standard path (handler → core → observation).
9. **Which risks from the list above do you want prioritized as "must address" vs. "acknowledge and defer" in Phase 2's HLD?** I have ordered by severity-of-incident-if-it-fires, not by frequency.
10. **Are the OAuth substrate tables (`provider_installations`, `encrypted_secrets`, `oauth_install_states`, `installation_audit_log`) considered settled, or in scope for Phase 2 design changes?** The IN-13 plan treats them as fixed.

---

**End of Phase 1.** Waiting for your review, answers to open questions, and direction on which risks Phase 2 must address before I begin the high-level design.
