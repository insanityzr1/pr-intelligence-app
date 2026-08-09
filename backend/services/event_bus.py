"""
In-process pub/sub for pushing changes to connected clients.

The app had no push channel at all: data was only as fresh as the last manual
"Sync PRs Now" click, with no polling, websocket, or SSE anywhere. This bus lets
webhook deliveries and the background sync worker notify the UI immediately.

Deliberately in-process and unbuffered-per-subscriber. That is correct for the
current single-worker deployment; a multi-worker or multi-instance deployment
needs Redis pub/sub behind this same interface (see L8).
"""

import asyncio
import json
import logging
from typing import Any, Dict, Set

logger = logging.getLogger(__name__)

# Bounded so a browser tab that stops reading cannot grow a queue without limit.
_QUEUE_MAX = 100


class EventBus:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAX)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, event_type: str, data: Dict[str, Any] = None):
        """
        Fan out to every subscriber.

        Safe to call from a non-async context. A full queue drops the event for
        that subscriber rather than blocking the publisher — a stalled client
        must never stall a webhook delivery or the sync worker.
        """
        payload = {"type": event_type, "data": data or {}}
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning("Dropping '%s' for a slow SSE subscriber.", event_type)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Failed to publish '%s': %s", event_type, exc)

    @staticmethod
    def format_sse(payload: Dict[str, Any]) -> str:
        return f"event: {payload['type']}\ndata: {json.dumps(payload['data'])}\n\n"


bus = EventBus()
