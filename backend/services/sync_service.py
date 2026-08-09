"""
Background PR synchronization.

All refresh was previously manual and pull-based: the frontend had to call
`POST /api/prs/sync`, and nothing else ever updated the data. This module gives
the app two automatic paths — a periodic reconciliation loop and on-demand
refresh triggered by webhook deliveries — both publishing to the event bus so
connected clients update without a reload.
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional

import database
from config import settings
from services.event_bus import bus
from services.github_service import GitHubService, GitHubServiceError

logger = logging.getLogger(__name__)

# Last sync outcome per repo, surfaced by /api/events/status so a silently
# failing sync is visible rather than looking like "no changes".
_last_sync: Dict[str, dict] = {}

# Prevents a burst of webhook deliveries for one repo from stacking syncs.
_locks: Dict[str, asyncio.Lock] = {}


class SyncService:
    @staticmethod
    def last_sync_report() -> Dict[str, dict]:
        return _last_sync

    @staticmethod
    def sync_repo(repo_name: str, reason: str = "manual") -> dict:
        """
        Fetch a repo's PRs, persist them, and refresh the in-process cache.

        Imported lazily to avoid a circular import: routers.prs imports services,
        and this service needs the router's cache.
        """
        from routers.prs import _prs_cache

        started = time.time()
        try:
            prs = GitHubService.fetch_prs(
                count=settings.PR_FETCH_LIMIT, state="open", repo_name=repo_name
            )
        except GitHubServiceError as exc:
            logger.error("Sync failed for %s: %s", repo_name, exc)
            _last_sync[repo_name] = {
                "ok": False, "reason": str(exc), "at": time.time(), "trigger": reason,
            }
            bus.publish("sync_failed", {"repo_name": repo_name, "error": str(exc)})
            return _last_sync[repo_name]

        database.save_prs(prs, repo_name)

        changed = 0
        for pr in prs:
            key = f"{repo_name}#{pr['number']}"
            previous = _prs_cache.get(key)
            cached_ai = database.get_cached_ai_review(pr["number"], pr["head_sha"], repo_name)
            if cached_ai:
                pr["ai_review"] = cached_ai
            # Compare on the fields that actually drive the UI, so an unchanged
            # PR does not look like an update on every poll.
            if not previous or any(
                previous.get(f) != pr.get(f)
                for f in ("head_sha", "mergeable", "checks_state", "review_decision", "status")
            ):
                changed += 1
            _prs_cache[key] = pr

        report = {
            "ok": True, "count": len(prs), "changed": changed,
            "at": time.time(), "duration": round(time.time() - started, 2),
            "trigger": reason,
        }
        _last_sync[repo_name] = report

        if changed:
            bus.publish("prs_updated", {
                "repo_name": repo_name, "count": len(prs),
                "changed": changed, "trigger": reason,
            })
        return report

    @staticmethod
    async def sync_repo_async(repo_name: str, reason: str = "webhook") -> dict:
        """Run a sync off the event loop, serialized per repository."""
        lock = _locks.setdefault(repo_name, asyncio.Lock())
        async with lock:
            return await asyncio.to_thread(SyncService.sync_repo, repo_name, reason)

    @staticmethod
    async def sync_all(reason: str = "scheduled") -> List[dict]:
        repos = [r["repo_name"] for r in database.get_repositories()]
        results = []
        for repo_name in repos:
            try:
                results.append(await SyncService.sync_repo_async(repo_name, reason))
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Unexpected sync error for %s: %s", repo_name, exc)
        return results

    @staticmethod
    async def run_periodic(stop_event: asyncio.Event):
        """
        Reconciliation loop.

        Webhooks are the primary freshness mechanism; this catches missed or
        undelivered events. Set SYNC_INTERVAL_SECONDS=0 to disable.
        """
        interval = settings.SYNC_INTERVAL_SECONDS
        if interval <= 0:
            logger.info("Background sync disabled (SYNC_INTERVAL_SECONDS=0).")
            return

        logger.info("Background sync every %ss.", interval)
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
                return  # stop_event set → shutting down
            except asyncio.TimeoutError:
                pass

            try:
                await SyncService.sync_all("scheduled")
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Background sync cycle failed: %s", exc)
