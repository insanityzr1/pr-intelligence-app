"""
Inbound GitHub webhooks and the outbound SSE stream.

Before this, the app had no way to learn that anything changed: no webhook, no
poller, no push channel. Data was only as fresh as the last manual sync click.
"""

import asyncio
import hashlib
import hmac
import json
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import settings
from services.event_bus import bus
from services.sync_service import SyncService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Events"])

# Events that change something the UI displays. Anything else is acknowledged
# and ignored, so GitHub does not retry deliveries we intentionally skip.
RELEVANT_EVENTS = {
    "pull_request",
    "pull_request_review",
    "check_suite",
    "check_run",
    "status",
    "push",
}


def _verify_signature(body: bytes, signature: Optional[str]) -> bool:
    """
    Validate GitHub's HMAC-SHA256 signature.

    When no secret is configured the endpoint stays open (useful for local
    tunnels), but that is logged loudly — an unauthenticated webhook lets anyone
    trigger syncs against configured repos.
    """
    secret = settings.GITHUB_WEBHOOK_SECRET
    if not secret:
        logger.warning(
            "Webhook received with no GITHUB_WEBHOOK_SECRET set — signature not verified."
        )
        return True

    if not signature or not signature.startswith("sha256="):
        return False

    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # Constant-time compare: a plain == leaks the signature byte by byte.
    return hmac.compare_digest(expected, signature)


@router.post("/webhooks/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(default=""),
    x_hub_signature_256: Optional[str] = Header(default=None),
):
    body = await request.body()

    if not _verify_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Malformed JSON payload.")

    repo_name = (payload.get("repository") or {}).get("full_name")

    if x_github_event not in RELEVANT_EVENTS:
        # 200, not 4xx: GitHub retries failures, and we are not interested.
        return {"status": "ignored", "event": x_github_event}

    if not repo_name:
        return {"status": "ignored", "reason": "no repository in payload"}

    logger.info("Webhook: %s for %s", x_github_event, repo_name)

    # Refresh out of band so GitHub's delivery timeout is never at the mercy of
    # a slow `gh` call.
    asyncio.create_task(SyncService.sync_repo_async(repo_name, reason=f"webhook:{x_github_event}"))

    bus.publish("webhook", {"event": x_github_event, "repo_name": repo_name})
    return {"status": "accepted", "event": x_github_event, "repo_name": repo_name}


@router.get("/events")
async def event_stream(request: Request):
    """
    Server-sent events: PR syncs, webhook deliveries, and AI job progress.

    SSE rather than websockets because every message here is server→client;
    there is no client→server channel to justify the extra machinery.
    """
    queue = bus.subscribe()

    async def generator():
        try:
            yield bus.format_sse({"type": "connected", "data": {}})
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield bus.format_sse(payload)
                except asyncio.TimeoutError:
                    # Comment frame: keeps proxies from closing an idle stream.
                    yield ": keep-alive\n\n"
        finally:
            bus.unsubscribe(queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Nginx buffers streamed responses by default, which breaks SSE.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/events/status")
def events_status():
    return {
        "subscribers": bus.subscriber_count,
        "webhook_secret_configured": bool(settings.GITHUB_WEBHOOK_SECRET),
        "background_sync_enabled": settings.SYNC_INTERVAL_SECONDS > 0,
        "sync_interval_seconds": settings.SYNC_INTERVAL_SECONDS,
        "last_sync": SyncService.last_sync_report(),
    }
