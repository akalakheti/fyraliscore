"""services/integrations/gmail/fetcher.py — shared history-drain + dispatch.

Both the push handler and the history poller funnel through here:

    drain_mailbox_history(pool, gmail, tenant_id, install_id, email, read_path)

This module:
  1. Looks up the mailbox's last-known history_id and the install's scope.
  2. Pages users.history.list with historyTypes=['messageAdded'].
  3. For each new messageId: users.messages.get → ingest via the
     `gmail:` handler (which does thread canonicalization + dedup +
     observation write).
  4. Advances history_id and stamps last_push_at / last_poll_at on
     success.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog

from lib.shared.tenant_context import bind_tenant, tenant_transaction

from services.integrations.gmail.audit import write_read_audit
from services.integrations.gmail.client import (
    GMAIL_METADATA_SCOPE,
    GMAIL_READONLY_SCOPE,
    GmailClient,
    GoogleApiError,
)


log = structlog.get_logger("integrations.gmail.fetcher")


SCOPE_ALIAS = {
    "gmail.metadata": GMAIL_METADATA_SCOPE,
    "gmail.readonly": GMAIL_READONLY_SCOPE,
}


async def drain_mailbox_history(
    *,
    pool: Any,
    gmail: GmailClient,
    tenant_id: UUID,
    gmail_installation_id: UUID,
    email_address: str,
    read_path: str,
) -> dict[str, Any]:
    """Drain new history for one mailbox. Returns a small counters dict.

    NOTE: a single drain may issue many API calls. Caller is expected
    to scope concurrency per (install, email) — typically by leasing
    via FOR UPDATE SKIP LOCKED in the poller, or by serializing pushes
    per subscription.
    """
    if read_path not in ("push", "poll"):
        raise ValueError(f"read_path must be 'push' or 'poll', got {read_path!r}")

    # --- step 1: load watch row + install scope (single tenant txn).
    async with pool.acquire() as conn:
        async with conn.transaction():
            async with bind_tenant(conn, tenant_id) as tctx:
                watch_row = await tctx.fetchrow(
                    """
                    SELECT mw.id, mw.history_id, mw.state, gi.scope
                      FROM gmail_mailbox_watches mw
                      JOIN gmail_installations gi
                        ON gi.id = mw.gmail_installation_id
                     WHERE mw.gmail_installation_id = $1
                       AND mw.email_address = $2
                    """,
                    gmail_installation_id, email_address.lower(),
                )
    if watch_row is None:
        return {"status": "skipped", "reason": "no_watch_row"}
    if watch_row["state"] in ("paused", "opted_out"):
        return {"status": "skipped", "reason": "watch_inactive", "state": watch_row["state"]}
    if not watch_row["history_id"]:
        return {"status": "skipped", "reason": "no_history_bookmark"}

    scope_alias = watch_row["scope"]
    scope_long = SCOPE_ALIAS[scope_alias]

    # --- step 2: page history.list, collecting new messageIds.
    new_message_ids: list[str] = []
    new_history_id: str | None = watch_row["history_id"]
    page_token: str | None = None
    while True:
        page = await gmail.history_list(
            user_email=email_address,
            scope=scope_long,
            start_history_id=watch_row["history_id"],
            page_token=page_token,
        )
        for entry in page.get("history") or []:
            for added in entry.get("messagesAdded") or []:
                msg = (added or {}).get("message") or {}
                msg_id = msg.get("id")
                if msg_id:
                    new_message_ids.append(msg_id)
        # Gmail's historyId on the response is the canonical "you are
        # caught up through this point" bookmark.
        latest = page.get("historyId")
        if latest:
            new_history_id = str(latest)
        page_token = page.get("nextPageToken")
        if not page_token:
            break

    # --- step 3: for each new message: get + ingest.
    ingested = 0
    deduped = 0
    if new_message_ids:
        # Local import to avoid module-load cycles via the handler registry.
        from services.ingestion.handlers.gmail import dispatch_gmail_message_resource

        for msg_id in new_message_ids:
            try:
                resource = await gmail.get_message(
                    user_email=email_address, scope=scope_long, message_id=msg_id,
                )
            except GoogleApiError as exc:
                log.warning(
                    "gmail.fetcher.get_message_failed",
                    email=email_address, message_id=msg_id, error=str(exc)[:200],
                )
                continue

            try:
                result = await dispatch_gmail_message_resource(
                    pool=pool,
                    tenant_id=tenant_id,
                    gmail_installation_id=gmail_installation_id,
                    email_address=email_address,
                    scope_alias=scope_alias,
                    message_resource=resource,
                    read_path=read_path,
                )
            except Exception as exc:  # noqa: BLE001 — handler errors should not stop the drain
                log.warning(
                    "gmail.fetcher.ingest_failed",
                    email=email_address, message_id=msg_id, error=str(exc)[:200],
                )
                continue

            if result is None:
                continue
            if result.get("deduped"):
                deduped += 1
            else:
                ingested += 1

            # Append the per-message read audit (inside its own short txn).
            async with tenant_transaction(tenant_id) as tctx:
                await write_read_audit(
                    tctx,
                    gmail_installation_id=gmail_installation_id,
                    email_address=email_address,
                    message_id=msg_id,
                    scope_used=scope_alias,
                    read_path=read_path,
                )

    # --- step 4: advance bookmark + timestamp.
    async with tenant_transaction(tenant_id) as tctx:
        if read_path == "push":
            await tctx.execute(
                """
                UPDATE gmail_mailbox_watches
                   SET history_id = COALESCE($3, history_id),
                       last_push_at = now(),
                       consecutive_poll_failures = 0,
                       last_error = NULL
                 WHERE gmail_installation_id = $1
                   AND email_address = $2
                """,
                gmail_installation_id, email_address.lower(), new_history_id,
            )
        else:
            await tctx.execute(
                """
                UPDATE gmail_mailbox_watches
                   SET history_id = COALESCE($3, history_id),
                       last_poll_at = now(),
                       consecutive_poll_failures = 0,
                       last_error = NULL
                 WHERE gmail_installation_id = $1
                   AND email_address = $2
                """,
                gmail_installation_id, email_address.lower(), new_history_id,
            )

    return {
        "status": "ok",
        "ingested": ingested,
        "deduped": deduped,
        "messages_seen": len(new_message_ids),
        "history_id": new_history_id,
    }


__all__ = ["drain_mailbox_history"]
