# Gmail Integration (Workspace DWD, push-primary)

> **Status:** Design only. Not implemented. This document captures the architecture for review and future implementation.

## Context

Gmail is the highest-density organizational signal source Fyralis ingests: promise-bearing threads to customers feed the **Bridge Layer**, internal coordination feeds the **Execution Graph**, customer-facing inbound feeds the **Customer Graph**, and the long tail lands in **Memory Fabric (Tier 3)** to be promoted by threshold. We are not building an email client. We are extracting organizational signal from a messaging substrate.

Two facts shape every downstream decision:

1. **There is no single Gmail firehose.** Workspace ingests per-user; what changes is *how the consent is granted*. We are shipping **domain-wide delegation (DWD)** — a Workspace super-admin authorizes a Fyralis service account to impersonate any user in the domain at admin-chosen scopes. No individual employee consent dialog. Per-user OAuth is a deliberate non-goal in v1 (deferred to a later "wedge / contractor" spec).
2. **Push, not poll, is the only mechanism that scales.** Gmail emits a Pub/Sub notification on any mailbox change; we fetch deltas via `users.history.list`. Polling alone burns quota and lags. But Pub/Sub *alone* loses messages when watches expire (7-day TTL), when a tenant disconnects briefly, or when the subscription backlog overflows — so v1 ships **push primary with `history.list` poll fallback**.

This spec covers OAuth-equivalent DWD admin connect, per-tenant Pub/Sub provisioning, watch lifecycle, push-handler webhook, history-poller fallback, scope-aware fetcher (`gmail.metadata` and `gmail.readonly` selectable per install), Directory-API mailbox enumeration with admin selection, per-user opt-out, RFC 5322 thread canonicalization & dedup, and an ingest handler emitting the `gmail:` source channel.

**Historical backfill is explicitly out of scope.** A newly-connected tenant sees an empty product until live messages flow. The follow-up integration with `specs/002-integration-backfill/` is named below in §Rollout.

---

## Decisions locked with the user

- **Auth mode:** Workspace DWD only. Per-user OAuth and consumer `@gmail.com` accounts are deferred. Service account JSON key resides in KMS-managed secrets; impersonated bearer tokens are minted JIT and never persisted.
- **Scope:** `https://www.googleapis.com/auth/gmail.metadata` **OR** `https://www.googleapis.com/auth/gmail.readonly`, selected at admin connect, scoped install-wide. We never request `gmail.modify`, `gmail.send`, or full `mail.google.com`. Per-role downgrade (legal/HR forced to metadata) is a follow-up spec.
- **Delivery:** Pub/Sub push primary + `users.history.list` poll fallback. A watch-renewal scheduler maintains every active mailbox's `users.watch` registration before its 7-day expiry. Poller runs at a low interval (default 10 min) to recover from dropped pushes or watch gaps.
- **Mailbox enumeration:** Admin Directory API at connect → admin selects users, groups, and/or org units. Selection persisted as an inclusion set; resolved nightly to the concrete user list. Per-user opt-out store overrides the inclusion set.
- **Pub/Sub topic ownership:** Per-tenant topic + subscription, programmatically provisioned in Fyralis's GCP project at admin connect. No customer GCP work. Customer-owned-topic mode is a follow-up for regulated deals.
- **Dedup:** Thread canonicalization on ingest using RFC 5322 `Message-ID` / `In-Reply-To` / `References`. One canonical thread row; per-mailbox arrivals collapse into it. Forwarded threads (broken chains) are best-effort.
- **Backfill:** Out of scope. Reuse `specs/002-integration-backfill/` as the historical pull lane once it lands and Gmail is added as a `BackfillProvider`.

---

## Architecture overview

Three workers, one webhook, one HTTP admin-connect surface, six new tables:

```
Admin browser ─┐
               │  (1) OAuth-equivalent admin consent → DWD scope grant
               ▼
       services/integrations/gmail/oauth.py
               │
               │  (2) Directory API → admin selects users/groups/OUs
               │  (3) Provision per-tenant Pub/Sub topic+subscription
               │  (4) For each selected mailbox: impersonate → users.watch(topicName=…)
               ▼
        Gmail (Google) ──push──> Pub/Sub topic ──pull──> services/webhooks/gmail_pubsub.py
                                                                  │
                                                                  │ (5) Verify Google-signed JWT
                                                                  │ (6) Lookup tenant by subscription
                                                                  │ (7) Call users.history.list(startHistoryId)
                                                                  ▼
                                                       services/ingestion/handlers/gmail.py
                                                                  │
                                                                  │ (8) Per-message:
                                                                  │   • thread canonicalization (RFC 5322)
                                                                  │   • ON CONFLICT dedup against existing observations
                                                                  │   • emit observation on channel "gmail:"
                                                                  ▼
                                                            observations table
                                                            (existing Think pipeline takes over)

   ┌──── scripts/run_gmail_watch_scheduler.py
   │     • polls gmail_mailbox_watches WHERE expiration < now()+1d
   │     • re-issues users.watch, updates expiration
   │
   └──── scripts/run_gmail_history_poller.py
         • polls gmail_mailbox_watches WHERE last_poll_at < now()-interval
         • calls users.history.list(startHistoryId=last_known) as fallback
         • re-enters the same ingest path as the push handler
```

Both workers and the push handler funnel into a single ingest entry point: `services/ingestion/handlers/gmail.py`, which is **the only place** that writes observations for Gmail. Push and poll never race on the same message — both call `INSERT … ON CONFLICT DO NOTHING` against `observations.UNIQUE (source_channel, external_id, occurred_at)` and against the new `gmail_threads_canonical` table.

**Trust surface.** The DWD service account JSON key never leaves the KMS process (`lib/shared/secrets/`). Workers call a `mint_user_token(installation_id, email, scopes) → short_lived_bearer` helper that performs JWT-bearer exchange just-in-time. Tokens are scope-checked at mint time against the install's authorized scope, never written to disk, never logged. Per-user revocation (opt-out) works by removing the user from the resolved inclusion set and calling `users.stop()` to drop the watch — no other tenant or user is affected.

**Tenancy.** Every per-tenant table uses RLS analogous to `provider_installations`. Workers call `bind_tenant(conn, tenant_id)` (`lib/shared/tenant_context.py`) before any tenant-scoped read or write. The push handler resolves `subscription_name → tenant_id` via `gmail_pubsub_topics` *before* binding, since the Pub/Sub message itself is cross-tenant from the worker's perspective.

---

## Schema migration

**File:** main is at `0030`. Provisional: `db/migrations/0031_gmail_integration.sql`. The FK from `gmail_installations.installation_id` to `provider_installations(id)` is **deferred until IN-13 merges** — v1 lands a self-contained `gmail_installations` row with the same conceptual fields. Migration written so an `ALTER TABLE … ADD CONSTRAINT` can stitch the FK in later. Same for a future `installation_audit_log` cross-cut — v1 writes audit rows to a sibling `gmail_install_audit` table.

```sql
BEGIN;

-- Per-install configuration: scope, status, inclusion set.
-- Extends provider_installations (provider='gmail') from IN-13.
CREATE TABLE IF NOT EXISTS gmail_installations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  installation_id UUID NOT NULL REFERENCES provider_installations(id) ON DELETE CASCADE,
  workspace_domain TEXT NOT NULL,             -- 'acme.com'
  service_account_email TEXT NOT NULL,        -- DWD impersonator
  scope TEXT NOT NULL CHECK (scope IN ('gmail.metadata','gmail.readonly')),
  inclusion_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
                                              -- { users:[…], groups:[…], org_units:[…] }
  resolved_user_count INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  UNIQUE (tenant_id, workspace_domain)
);

-- Per-tenant Pub/Sub topic + subscription (Fyralis-owned project).
CREATE TABLE IF NOT EXISTS gmail_pubsub_topics (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gmail_installation_id UUID NOT NULL REFERENCES gmail_installations(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL UNIQUE,            -- 'projects/fyralis-prod/topics/gmail-{tenant_id}'
  subscription_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  teardown_at TIMESTAMPTZ
);

CREATE INDEX gmail_pubsub_topics_subscription_idx
  ON gmail_pubsub_topics (subscription_name)
  WHERE teardown_at IS NULL;

-- One row per actively-watched mailbox.
CREATE TABLE IF NOT EXISTS gmail_mailbox_watches (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gmail_installation_id UUID NOT NULL REFERENCES gmail_installations(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  google_user_id TEXT,                        -- Directory API id, nullable until first resolve
  history_id TEXT,                            -- last seen historyId
  watch_expiration TIMESTAMPTZ,               -- Google returns ms-epoch; stored as tstz
  last_push_at TIMESTAMPTZ,
  last_poll_at TIMESTAMPTZ,
  consecutive_poll_failures INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending'
       CHECK (state IN ('pending','active','paused','opted_out','errored')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gmail_installation_id, email_address)
);

CREATE INDEX gmail_mailbox_watches_expiry_idx
  ON gmail_mailbox_watches (watch_expiration)
  WHERE state = 'active';
CREATE INDEX gmail_mailbox_watches_poll_idx
  ON gmail_mailbox_watches (last_poll_at NULLS FIRST)
  WHERE state = 'active';

-- Per-user opt-out store. Overrides inclusion_spec.
CREATE TABLE IF NOT EXISTS gmail_mailbox_optouts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gmail_installation_id UUID NOT NULL REFERENCES gmail_installations(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  reason TEXT,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gmail_installation_id, email_address)
);

-- Canonical thread record. One row per RFC 5322 thread, regardless of
-- how many mailbox copies see it. Per-mailbox observations point here
-- via thread_canonical_id (added to observations as a nullable column
-- in this migration to avoid cross-cutting schema churn).
CREATE TABLE IF NOT EXISTS gmail_threads_canonical (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gmail_installation_id UUID NOT NULL REFERENCES gmail_installations(id) ON DELETE CASCADE,
  canonical_message_id TEXT NOT NULL,         -- root RFC 5322 Message-ID
  subject_normalized TEXT,
  participant_emails TEXT[] NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (gmail_installation_id, canonical_message_id)
);

CREATE INDEX gmail_threads_canonical_participants_idx
  ON gmail_threads_canonical USING GIN (participant_emails);

-- Lookup table for thread membership; a Message-ID maps to its
-- canonical thread row. Lets the canonicalizer resolve in-reply-to /
-- references chains without re-walking.
CREATE TABLE IF NOT EXISTS gmail_thread_members (
  message_id TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gmail_installation_id UUID NOT NULL REFERENCES gmail_installations(id) ON DELETE CASCADE,
  thread_canonical_id UUID NOT NULL REFERENCES gmail_threads_canonical(id) ON DELETE CASCADE,
  PRIMARY KEY (gmail_installation_id, message_id)
);

-- Append-only read attestation log. "Who's mail did we read, when, by which path."
-- The sales-asset trust differentiator referenced in the context.
CREATE TABLE IF NOT EXISTS gmail_read_audit (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  gmail_installation_id UUID NOT NULL REFERENCES gmail_installations(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  message_id TEXT NOT NULL,
  scope_used TEXT NOT NULL,                   -- 'gmail.metadata' | 'gmail.readonly'
  read_path TEXT NOT NULL,                    -- 'push' | 'poll'
  read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX gmail_read_audit_lookup_idx
  ON gmail_read_audit (gmail_installation_id, email_address, read_at DESC);

-- Add nullable thread linkage to observations (no churn on existing rows).
ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS thread_canonical_id UUID;
CREATE INDEX IF NOT EXISTS observations_thread_canonical_idx
  ON observations (thread_canonical_id) WHERE thread_canonical_id IS NOT NULL;

-- RLS.
ALTER TABLE gmail_installations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_installations         FORCE  ROW LEVEL SECURITY;
ALTER TABLE gmail_pubsub_topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_pubsub_topics         FORCE  ROW LEVEL SECURITY;
ALTER TABLE gmail_mailbox_watches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_mailbox_watches       FORCE  ROW LEVEL SECURITY;
ALTER TABLE gmail_mailbox_optouts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_mailbox_optouts       FORCE  ROW LEVEL SECURITY;
ALTER TABLE gmail_threads_canonical     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_threads_canonical     FORCE  ROW LEVEL SECURITY;
ALTER TABLE gmail_thread_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_thread_members        FORCE  ROW LEVEL SECURITY;
ALTER TABLE gmail_read_audit            ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_read_audit            FORCE  ROW LEVEL SECURITY;
-- Policies analogous to provider_installations (current_tenant_id() = tenant_id).

COMMIT;
```

No change to `think_trigger_queue`. `observations.thread_canonical_id` is nullable, so non-Gmail observations are unaffected.

---

## Module structure

```
services/integrations/gmail/
  __init__.py
  oauth.py                 # Admin DWD connect wizard: consent → directory enum → scope pick → provision
  dwd.py                   # Service account loader + JIT impersonated-token mint (KMS-resident key)
  directory.py             # Directory API: list users / groups / OUs; resolve inclusion_spec → emails
  client.py                # Authed Gmail API client per (installation_id, email_address); refresh-aware
  pubsub.py                # Per-tenant topic + subscription provision / teardown
  watch.py                 # users.watch / users.stop lifecycle for a single mailbox
  watch_scheduler.py       # Worker body: renew watches expiring in <24h
  history_poller.py        # Worker body: history.list per mailbox at interval; fallback ingest path
  push_handler.py          # Logic invoked by the gateway Pub/Sub-push webhook
  threading.py             # RFC 5322 canonicalization: Message-ID, In-Reply-To, References → canonical_thread_id
  optout.py                # Read/write gmail_mailbox_optouts; honored by enumeration + watch lifecycle
  audit.py                 # Append to gmail_read_audit; one call per message read
  uninstall.py             # Per-mailbox or per-install teardown: users.stop, drop topic/subscription
  status_api.py            # GET /v1/integrations/gmail/status — watches, last push, last poll, errors
  tests/

services/ingestion/handlers/
  gmail.py                 # New handler. Channel='gmail:'. Receives normalized envelope from
                           # push_handler / history_poller. Calls threading.canonicalize → emits
                           # observation via existing ingest() with thread_canonical_id stamped.

services/webhooks/
  gmail_pubsub.py          # POST /webhooks/gmail/pubsub. Verifies Google-signed JWT, looks up
                           # tenant by subscription_name, delegates to push_handler.

scripts/
  run_gmail_watch_scheduler.py    # Mirrors scripts/run_think_worker.py shape
  run_gmail_history_poller.py     # Same shape

db/migrations/00NN_gmail_integration.sql
```

`scripts/dogfood_up.sh` adds two worker launches after the post-commit / backfill worker block.

---

## Component flows

### 1. Admin connect (`services/integrations/gmail/oauth.py`)

Workspace DWD is set up out-of-band in the customer's Admin Console:
**Admin Console → Security → API Controls → Domain-wide Delegation → Add new** → paste Fyralis service-account *client ID* + the requested OAuth scope (`gmail.readonly` or `gmail.metadata`).

The connect wizard's job is to validate that the grant exists, enumerate the org, and capture the admin's selection:

1. Admin lands on `/integrations/gmail/connect`, types their Workspace primary domain (`acme.com`) and the email of a super-admin in that domain. (We impersonate the super-admin only for the Directory API call below.)
2. Backend mints an impersonated token for that admin with scope `admin.directory.user.readonly`.
3. Call `directory.users.list(domain=…)` + `directory.groups.list` + `directory.orgunits.list`. If the call returns `unauthorized_client` → render an inline page explaining the DWD-grant step with the exact client ID + scope strings to paste. (This is the most common onboarding failure.)
4. Render the user/group/OU selector. Admin picks an inclusion set and the install-wide scope (`metadata` vs `readonly`).
5. **One transaction:**
   - Insert `provider_installations` row (`provider='gmail'`).
   - Insert `gmail_installations` row with `inclusion_spec`, `scope`.
   - Insert `installation_audit_log` row (`action='gmail.install'`).
6. Out of band (background task, idempotent and resumable):
   - Resolve `inclusion_spec` → concrete email list via Directory API.
   - Provision `projects/fyralis-prod/topics/gmail-{tenant_id}` and a matching subscription. Grant `gmail-api-push@system.gserviceaccount.com` `pubsub.publisher` on the topic.
   - Configure the subscription as push to `https://gateway.fyralis.app/webhooks/gmail/pubsub` with OIDC-token authentication (we verify the JWT in the webhook).
   - For each resolved email: insert `gmail_mailbox_watches(state='pending')` and call `users.watch(topicName=…)`; on success, write back `history_id`, `watch_expiration`, set `state='active'`.

### 2. Push receive (`services/webhooks/gmail_pubsub.py` + `push_handler.py`)

```
POST /webhooks/gmail/pubsub
Authorization: Bearer <Google-signed OIDC JWT>
Content-Type: application/json
{
  "message": {
    "data": "<base64 of {emailAddress, historyId}>",
    "messageId": "...",
    "publishTime": "...",
    "attributes": {"subscription": "projects/…/subscriptions/gmail-{tenant_id}-sub"}
  },
  "subscription": "projects/…/subscriptions/gmail-{tenant_id}-sub"
}
```

1. Verify the OIDC JWT (audience = our webhook URL, signer = Google).
2. Look up `gmail_pubsub_topics WHERE subscription_name = ?` → `tenant_id`, `gmail_installation_id`.
3. `bind_tenant(conn, tenant_id)`.
4. Decode `data` → `{emailAddress, historyId}`.
5. Load `gmail_mailbox_watches WHERE email_address = ? AND gmail_installation_id = ?`. If `state != 'active'` → 200 OK and drop (paused / opted out).
6. `mint_user_token(installation_id, email_address, scope=install.scope)`.
7. Call `users.history.list(startHistoryId=last_history_id, historyTypes=['messageAdded'])`. Page until exhausted.
8. For each new `messageId`:
   - `users.messages.get(id=messageId, format=install.scope == 'gmail.metadata' ? 'metadata' : 'full')`.
   - Append `gmail_read_audit`.
   - Hand off to `services/ingestion/handlers/gmail.py`.
9. Update `gmail_mailbox_watches.history_id` to the new max, `last_push_at = now()`.

200 OK on success; **always 200 OK on transient failures with `Retry-After`-like backoff via Pub/Sub retry** — non-2xx makes Pub/Sub re-deliver, which we want only for genuine bugs.

### 3. History poll fallback (`scripts/run_gmail_history_poller.py`)

Mirrors `scripts/run_think_worker.py` shape: lease via `FOR UPDATE SKIP LOCKED`, exponential backoff on errors, SIGTERM-aware.

```sql
SELECT … FROM gmail_mailbox_watches
 WHERE state = 'active'
   AND (last_poll_at IS NULL OR last_poll_at < now() - interval '10 minutes')
 ORDER BY last_poll_at NULLS FIRST
 LIMIT $1
 FOR UPDATE SKIP LOCKED;
```

For each leased mailbox: same `history.list` + ingest sequence as the push handler (steps 6–9), with `read_path='poll'` in `gmail_read_audit`. The dedup at observation level + `gmail_thread_members.PRIMARY KEY` makes overlap with a concurrent push a no-op.

On `quotaExceeded` 403: bump `consecutive_poll_failures`, set `last_poll_at = now() + retry_after`, release lease — same backoff shape as the backfill worker in `002`. After 5 consecutive failures, transition the mailbox to `state='errored'` and surface in the status API.

### 4. Watch renewal (`scripts/run_gmail_watch_scheduler.py`)

```sql
SELECT … FROM gmail_mailbox_watches
 WHERE state = 'active'
   AND watch_expiration < now() + interval '24 hours'
 LIMIT $1
 FOR UPDATE SKIP LOCKED;
```

For each row: mint token, call `users.watch(topicName=…)`, update `watch_expiration`, `history_id` (the response gives a fresh one). On failure → exponential backoff, `state='errored'` after threshold. Runs every 15 minutes.

### 5. Thread canonicalization (`services/integrations/gmail/threading.py`)

```python
def canonicalize_thread(
    conn, *,
    tenant_id: UUID,
    installation_id: UUID,
    message_id: str,                    # RFC 5322 Message-ID of the new message
    in_reply_to: str | None,
    references: list[str],
    subject: str,
    participants: list[str],
) -> UUID:
    """Returns the canonical_thread_id for this message.
    Resolution order:
      1. If gmail_thread_members already has this message_id → return its canonical id (idempotent).
      2. Walk `in_reply_to` then `references` in reverse against gmail_thread_members.
         First hit → adopt that canonical id, insert this message_id as a member.
      3. Otherwise → this is a new root thread. Insert a new gmail_threads_canonical row
         keyed on this message_id; insert self as the first member.
    Updates participant_emails (union), last_seen_at, message_count atomically.
    """
```

Edge cases:
- **Forwarded threads with broken `References`**: the forward starts a new root thread. We don't try to stitch by subject — too lossy. Accepted in v1; consider a subject+participant heuristic in a follow-up.
- **Out-of-order arrival**: child arrives before parent. The child becomes its own root; when the parent eventually arrives we don't merge (would require a backfill pass over orphans). Logged as `_orphan_thread=true` in observation `content`; addressed in a follow-up.
- **Same message in 10 mailboxes**: step 1 dedups on `(installation_id, message_id)` PK. Only the first arrival writes a member row; the other 9 short-circuit and return the same canonical id. Their observations *do* still write (with the same `external_id`) and get squashed by `observations.UNIQUE`.

### 6. Ingest handler (`services/ingestion/handlers/gmail.py`)

Distinct from the existing `email.py` (which is Postmark/SendGrid inbound). Channel `gmail:`. `external_id = gmail:{installation_id}:{message_id}` — namespaced by install so a single message witnessed by two tenants stays separate.

```python
@register("gmail:")
async def ingest_gmail_message(
    *,
    tenant_id: UUID,
    installation_id: UUID,
    mailbox_email: str,
    scope: str,                          # 'gmail.metadata' or 'gmail.readonly'
    message_resource: dict,              # Gmail API message resource
    read_path: str,                      # 'push' | 'poll'
) -> ObservationDraft | None:
    headers = _headers_map(message_resource)
    message_id = headers.get("message-id")
    if not message_id:
        return None                      # malformed — log and drop
    thread_canonical_id = canonicalize_thread(
        conn,
        tenant_id=tenant_id,
        installation_id=installation_id,
        message_id=message_id,
        in_reply_to=headers.get("in-reply-to"),
        references=_split_refs(headers.get("references")),
        subject=headers.get("subject", ""),
        participants=_collect_participants(headers),
    )

    payload = {
        "message_id": message_id,
        "thread_id_gmail": message_resource.get("threadId"),
        "from": headers.get("from"),
        "to": _split_addrs(headers.get("to")),
        "cc": _split_addrs(headers.get("cc")),
        "subject": headers.get("subject"),
        "date": headers.get("date"),
        "label_ids": message_resource.get("labelIds", []),
        "internal_date_ms": int(message_resource.get("internalDate", 0)),
        "size_estimate": message_resource.get("sizeEstimate"),
        "snippet": message_resource.get("snippet"),  # always present, even metadata scope
        "body": (
            _extract_body(message_resource)         # readonly scope only
            if scope == "gmail.readonly" else None
        ),
        "mailbox_email": mailbox_email,
        "scope_used": scope,
        "read_path": read_path,
    }

    return ObservationDraft(
        source_channel="gmail:",
        external_id=f"gmail:{installation_id}:{message_id}",
        occurred_at=_internal_date_to_dt(message_resource["internalDate"]),
        source_actor_ref=f"email:{headers.get('from')}",
        content=payload,
        thread_canonical_id=thread_canonical_id,
        trust_tier="inferential",
        entities_hint=_extract_entity_hints(payload),
    )
```

This is the **only** place that decides "is this thread already in the graph." Downstream Think/Bridge logic reads `thread_canonical_id` as the unit of analysis, not Gmail's per-mailbox `threadId`.

### 7. Per-user opt-out (`services/integrations/gmail/optout.py`)

`POST /v1/integrations/gmail/optout` (auth: any user in the tenant who can prove ownership of `email_address` via a short-lived opt-out link emailed to them, or a Workspace-admin override).

Effect:
- Insert `gmail_mailbox_optouts`.
- Update `gmail_mailbox_watches` → `state='opted_out'`.
- Call `users.stop(userId=email_address)` immediately.
- Future enumeration runs filter the address out of the resolved inclusion set.

Reverse with `DELETE /v1/integrations/gmail/optout/{email}` (admin only). Removing the opt-out re-resolves on the next enumeration tick.

---

## Critical files to read / modify

- `services/ingestion/core.py` — confirm the `ingest()` signature accepts `thread_canonical_id` (or extend by one nullable kwarg; mirror the pattern 002 uses for `trigger_subkind`).
- `services/ingestion/handlers/__init__.py` — register new handler.
- `services/ingestion/handlers/email.py` — reuse `_EMAIL_RE`, `_URL_RE`, header-parsing helpers (extract to a sibling `_email_common.py` rather than duplicating).
- `services/webhooks/signatures/` — add `google_oidc.py` for Pub/Sub JWT verification.
- `services/webhooks/router.py` (if present) — register `/webhooks/gmail/pubsub`.
- `services/gateway/` — route the new path; rate-limit and request-size cap.
- `lib/shared/secrets/store.py` — confirm GCP service-account JSON key storage path. If absent, extend with `get_service_account_key(provider='gmail')`.
- `lib/shared/tenant_context.py` — every worker DB call.
- `services/integrations/slack/oauth.py` (worktree IN-13) — borrow the OAuth callback transaction shape.
- `services/integrations/discord/` — borrow the `lifecycle.py` / `uninstall.py` patterns.
- `scripts/run_think_worker.py` — copy as a base for the two new worker scripts.
- `scripts/dogfood_up.sh` — add the two new worker launches.
- `db/migrations/0001_foundation.sql` — confirm `observations.UNIQUE (source_channel, external_id, occurred_at)` and `embedding_pending` defaults still apply.

---

## Verification plan

End-to-end against a sandbox Workspace tenant (or `simulation/` mocks if a real tenant is unavailable for CI):

```bash
# 1. Schema applied
psql -h localhost -p 5433 -U postgres -d company_os -c "\dt gmail_*"

# 2. Admin connect simulator
#    → http://localhost:8000/integrations/gmail/connect

# 3. After connect, every selected mailbox has an active watch
psql … -c "
  SELECT email_address, state, watch_expiration, history_id
  FROM gmail_mailbox_watches
  WHERE gmail_installation_id = '<INSTALL>'
  ORDER BY state, email_address;"
# Expect: all 'active', expiration ~7d out, history_id populated.

# 4. Per-tenant Pub/Sub topic + subscription exist
gcloud pubsub topics list --filter="name:gmail-${TENANT_ID}"
gcloud pubsub subscriptions list --filter="topic:gmail-${TENANT_ID}"

# 5. Send a test email to a watched mailbox, watch the push land
tail -f /tmp/company_os_logs/gateway.log | grep gmail_pubsub

# 6. Observation written exactly once, with thread linkage
psql … -c "
  SELECT external_id, thread_canonical_id, content->>'mailbox_email' mailbox
  FROM observations
  WHERE source_channel = 'gmail:' AND tenant_id = '<TENANT>'
  ORDER BY occurred_at DESC LIMIT 5;"

# 7. Internal thread fan-out dedups to one canonical thread
#    Send one email to alice@ + bob@ (both watched). Verify:
psql … -c "
  SELECT thread_canonical_id, COUNT(*)
  FROM observations
  WHERE source_channel = 'gmail:' AND tenant_id = '<TENANT>'
    AND content->>'message_id' = '<MSGID>'
  GROUP BY thread_canonical_id;"
# Expect: one canonical id, COUNT = 2 (one per recipient mailbox) — both
# observations share the same thread_canonical_id.

# 8. Poll fallback recovers a missed push
#    Kill the push handler, send 3 messages, restart.
psql … -c "
  SELECT email_address, last_push_at, last_poll_at, consecutive_poll_failures
  FROM gmail_mailbox_watches WHERE gmail_installation_id = '<INSTALL>';"
# Expect: last_poll_at advancing, observations for all 3 messages present.

# 9. Watch renewal: force expiration in the past, verify scheduler heals
psql … -c "UPDATE gmail_mailbox_watches SET watch_expiration = now() - interval '1h' WHERE id = '<W>';"
# Wait one tick, then:
psql … -c "SELECT watch_expiration FROM gmail_mailbox_watches WHERE id = '<W>';"
# Expect: ~7d in the future.

# 10. Per-user opt-out severs the mailbox without affecting others
curl -X POST localhost:8000/v1/integrations/gmail/optout -d '{"email":"alice@…"}'
psql … -c "
  SELECT email_address, state FROM gmail_mailbox_watches
  WHERE gmail_installation_id = '<INSTALL>';"
# Expect: alice → 'opted_out', others still 'active'.
# Send an email to alice — verify NO new observation row.

# 11. Read attestation: every read accounted for
psql … -c "
  SELECT email_address, scope_used, read_path, COUNT(*)
  FROM gmail_read_audit
  WHERE tenant_id = '<TENANT>' AND read_at > now() - interval '1h'
  GROUP BY 1,2,3 ORDER BY 4 DESC;"

# 12. RLS isolation
#    From tenant A's connection, attempt to SELECT from gmail_installations
#    bound to tenant B. Expect zero rows.

# 13. Token never written to disk
grep -r "BEGIN PRIVATE KEY" /tmp/company_os_logs/ /var/log/ 2>/dev/null
# Expect: no matches.
```

---

## Rollout & risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| DWD grant misconfigured by admin (wrong client ID / wrong scope) | High at first connect | Pre-flight Directory API call in `oauth.py`. Inline error page with copy-pasteable correct values. Surface in `installation_audit_log`. |
| Pub/Sub push retry storm if webhook returns 5xx during a deploy | Medium | Push handler always returns 200 on transient internal errors after persisting the `historyId` advance into an inbound queue. Only return non-2xx for genuine signature failures. |
| Watch expiry missed by scheduler (worker down >24h) → silent gap | Medium | History poller is the safety net: on next poll, `users.history.list(startHistoryId=last_known)` recovers up to ~7d of history per Google's retention. Alert if `watch_expiration < now()` for >1h. |
| Cross-tenant misrouting in push handler | Low (per-tenant subscriptions) | The subscription itself encodes `tenant_id`; lookup is by `subscription_name`, not `emailAddress`. Assert in the handler: every resolved `tenant_id` must match the `gmail_installation_id` resolved from the email. |
| GCP project quota: per-tenant topics | Low | 10k topics/project soft limit. At 1k tenants we're 10% of limit; renegotiate at 5k. Add Terraform module that can shard across projects if needed. |
| Service-account key leak | Catastrophic if it happens | Key never on worker disk. KMS-process boundary identical to Nexus NSCT. Rotate quarterly. Alert on any read outside `lib/shared/secrets/`. |
| Re-install replays watches | Medium | `gmail_installations.UNIQUE(tenant_id, workspace_domain)` blocks a duplicate install per domain. Reconnect flow re-uses the existing row, only updates `inclusion_spec` / `scope`. |
| `gmail.readonly` install ingests sensitive body content the admin didn't fully understand | High politically | At connect, the scope picker shows a sample of headers vs. body content with explicit "Fyralis will read message bodies for these mailboxes" copy. Admin must check a confirmation box. Logged into `installation_audit_log`. |
| Quota exhaustion at large orgs (1000+ mailboxes, watch renewal every 7d) | Medium | `users.watch` is cheap; the renewal scheduler trickles renewals (15-min cadence × N mailboxes/page). History.list per-user quotas: poller interval (10 min default) is well under the per-user-per-second limit. Monitor `quotaUser` headers. |
| Forwarded threads / broken `References` chain pollute the canonical thread table with duplicates | Medium | Accepted in v1. Surface as a `gmail_threads_canonical` row-count vs. `observations` ratio metric; if drift >2x, escalate to a subject+participant heuristic spec. |

**Out of scope (named follow-ups):**

- Per-user OAuth path (consumer `@gmail.com` and contractors outside the customer's domain).
- Customer-owned Pub/Sub topic mode (regulated-industry sales gate).
- Historical backfill — picked up by `specs/002-integration-backfill/` with a Gmail `BackfillProvider`. The provider mod's `discover_work_units` enumerates one unit per mailbox; `fetch_page` paginates `messages.list` and reuses the same ingest handler from this spec. Most of the work is already done in this spec; backfill adds only the provider shim.
- Per-role scope override (legal/HR/exec forced to metadata even on a `gmail.readonly` install).
- Attachment ingest (the spec for bodies treats body text only; attachments are an extension).
- Outbound mail (`gmail.send`) — Fyralis is explicitly read-only in v1.
- Bridge Layer LLM extractor that promotes promise-bearing threads from Memory Fabric — separate Think pipeline spec.
