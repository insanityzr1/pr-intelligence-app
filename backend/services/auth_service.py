"""
Optional API-key authentication.

The app previously had no auth of any kind — no dependency, no security scheme,
no sessions — while defaulting to `HOST=0.0.0.0`, which makes it LAN-open. That
is defensible for a single-user local tool and indefensible the moment it is
deployed anywhere shared.

This is deliberately a shared-secret gate, not a user system: it removes the
"anyone on the network can drive this" problem without inventing half a login
flow. Full multi-tenancy (per-user GitHub OAuth, workspace ownership) is the
remaining part of L8 and needs a real user model to be worth building.

Disabled by default so existing installs are unaffected; set API_KEY to enable.
"""

import hmac
import logging
from typing import Optional

from fastapi import Header, HTTPException, Request

from config import settings

logger = logging.getLogger(__name__)

# Reachable without a key even when auth is on: liveness probes and the version
# banner must work for monitoring, and the SPA has to load in order to prompt.
PUBLIC_PATHS = {"/health", "/api/version", "/api/webhooks/github"}


def auth_enabled() -> bool:
    return bool(settings.API_KEY)


async def require_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(default=None),
):
    """
    FastAPI dependency enforcing the shared API key.

    The webhook route is exempt because GitHub cannot send a custom header —
    it authenticates with its own HMAC signature instead (see routers/events).
    """
    if not auth_enabled():
        return

    path = request.url.path
    if path in PUBLIC_PATHS or not path.startswith("/api/"):
        return

    supplied = x_api_key
    if not supplied:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            supplied = auth_header[7:].strip()

    # Constant-time compare: `==` on a secret leaks it byte by byte under timing
    # analysis.
    if not supplied or not hmac.compare_digest(supplied, settings.API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
