"""services/webhooks/gmail_pubsub.py — Pub/Sub push webhook endpoint.

    POST /webhooks/gmail/pubsub
    Authorization: Bearer <Google-signed OIDC JWT>
    Content-Type: application/json
    {
      "message": {
        "data": "<base64 of {emailAddress, historyId}>",
        "messageId": "...",
        "publishTime": "..."
      },
      "subscription": "projects/.../subscriptions/gmail-{tenant}-sub"
    }

Verification order:
  1. Pull `Authorization: Bearer <jwt>` — required.
  2. Verify the JWT (audience = configured webhook audience, email =
     configured push SA, signed by Google).
  3. Parse the envelope.
  4. Hand off to services.integrations.gmail.push_handler.handle_push.

ALWAYS returns 200 on transient failures so Pub/Sub doesn't enter a
retry storm — the history poller is the safety net. Returns 401 only
when the OIDC token is missing / invalid.
"""
from __future__ import annotations

import os
from typing import Any

import asyncpg
import structlog
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from services.integrations.gmail.push_handler import (
    GmailPushError,
    decode_pubsub_message,
    handle_push,
)
from services.webhooks.signatures.google_oidc import (
    GoogleOidcError,
    verify_pubsub_oidc_token,
)


log = structlog.get_logger("webhooks.gmail_pubsub")


router = APIRouter(prefix="/webhooks/gmail", tags=["webhooks", "gmail"])


def _expected_audience() -> str:
    aud = os.environ.get("GMAIL_PUBSUB_PUSH_OIDC_AUDIENCE") or os.environ.get(
        "GMAIL_PUBSUB_PUSH_ENDPOINT"
    )
    if not aud:
        raise RuntimeError(
            "GMAIL_PUBSUB_PUSH_OIDC_AUDIENCE / GMAIL_PUBSUB_PUSH_ENDPOINT not set",
        )
    return aud


def _expected_email() -> str:
    email = os.environ.get("GMAIL_PUBSUB_PUSH_OIDC_SA")
    if not email:
        raise RuntimeError("GMAIL_PUBSUB_PUSH_OIDC_SA not set")
    return email


@router.post("/pubsub")
async def gmail_pubsub_push(
    request: Request,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization[len("bearer "):].strip()

    try:
        await verify_pubsub_oidc_token(
            token=token,
            expected_audience=_expected_audience(),
            expected_email=_expected_email(),
        )
    except GoogleOidcError as exc:
        log.warning("gmail.pubsub.oidc_invalid", error=str(exc)[:200])
        raise HTTPException(status_code=401, detail="oidc_invalid")

    try:
        envelope = await request.json()
    except ValueError as exc:
        log.warning("gmail.pubsub.bad_json", error=str(exc)[:200])
        # 200 to avoid retry storm — Google sent us garbage we can't act on.
        return JSONResponse(content={"status": "skipped", "reason": "bad_json"})

    deps = getattr(request.app.state, "deps", None)
    pool: asyncpg.Pool | None = getattr(deps, "pool", None) if deps else None
    if pool is None:
        log.error("gmail.pubsub.no_pool")
        return JSONResponse(content={"status": "skipped", "reason": "no_pool"})

    try:
        # Cheap sanity decode so a malformed envelope short-circuits
        # before we burn budget on push_handler internals.
        decode_pubsub_message(envelope)
    except GmailPushError as exc:
        log.warning("gmail.pubsub.bad_envelope", error=str(exc)[:200])
        return JSONResponse(content={"status": "skipped", "reason": "bad_envelope"})

    try:
        result = await handle_push(pool=pool, envelope=envelope)
    except Exception as exc:  # noqa: BLE001 — translate to 200 + log
        log.exception("gmail.pubsub.handler_error", error=str(exc)[:200])
        return JSONResponse(content={"status": "error_swallowed"})

    return JSONResponse(content=result)


__all__ = ["router"]
