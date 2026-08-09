"""
Async job queue for AI operations.

Batch AI review was a single blocking request that ran N sequential LLM calls on
FastAPI's threadpool, with no progress, no cancellation, and a native `alert()`
for the result. A 20-PR batch was one opaque multi-minute await that a browser
timeout could discard entirely.

Jobs here are in-memory and per-process. That matches the current single-worker
deployment; a durable queue (Redis/Celery) is the L8 upgrade path, behind this
same interface.
"""

import asyncio
import logging
import time
import uuid
from typing import Dict, List, Optional

import database
from services.ai_service import AIService
from services.event_bus import bus
from services.github_service import GitHubService, GitHubServiceError

logger = logging.getLogger(__name__)

_jobs: Dict[str, dict] = {}
_tasks: Dict[str, asyncio.Task] = {}

# Keep memory bounded; jobs are progress records, not results storage.
_MAX_JOBS = 200


class JobService:
    @staticmethod
    def get(job_id: str) -> Optional[dict]:
        return _jobs.get(job_id)

    @staticmethod
    def list_jobs(limit: int = 50) -> List[dict]:
        return sorted(_jobs.values(), key=lambda j: j["created_at"], reverse=True)[:limit]

    @staticmethod
    def _prune():
        if len(_jobs) <= _MAX_JOBS:
            return
        finished = sorted(
            (j for j in _jobs.values() if j["status"] in ("done", "failed", "cancelled")),
            key=lambda j: j["created_at"],
        )
        for job in finished[: len(_jobs) - _MAX_JOBS]:
            _jobs.pop(job["id"], None)

    @staticmethod
    def _publish(job: dict):
        bus.publish("job_update", {
            "id": job["id"], "status": job["status"], "kind": job["kind"],
            "total": job["total"], "completed": job["completed"],
            "failed": job["failed"], "current": job.get("current"),
            "repo_name": job.get("repo_name"),
        })

    @staticmethod
    def create_analyze_job(pr_numbers: List[int], repo_name: str, force: bool = False) -> dict:
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "kind": "analyze",
            "status": "queued",
            "repo_name": repo_name,
            "pr_numbers": pr_numbers,
            "total": len(pr_numbers),
            "completed": 0,
            "failed": 0,
            "current": None,
            "errors": [],
            "created_at": time.time(),
            "finished_at": None,
            "cancel_requested": False,
        }
        _jobs[job_id] = job
        JobService._prune()

        task = asyncio.create_task(JobService._run_analyze(job_id, force))
        _tasks[job_id] = task
        JobService._publish(job)
        return job

    @staticmethod
    async def _run_analyze(job_id: str, force: bool):
        from routers.prs import _prs_cache

        job = _jobs[job_id]
        job["status"] = "running"
        JobService._publish(job)

        repo_name = job["repo_name"]

        try:
            for number in job["pr_numbers"]:
                if job["cancel_requested"]:
                    job["status"] = "cancelled"
                    break

                job["current"] = number
                JobService._publish(job)

                key = f"{repo_name}#{number}"
                pr = _prs_cache.get(key)
                if not pr:
                    job["failed"] += 1
                    job["errors"].append({"pr_number": number, "error": "PR not in cache; sync first."})
                    continue

                if not force and pr.get("ai_review"):
                    job["completed"] += 1
                    continue

                try:
                    # Both calls are blocking (`subprocess` + `requests`), so they
                    # run off the event loop to keep SSE and the API responsive.
                    diff = await asyncio.to_thread(
                        GitHubService.fetch_pr_diff, number, repo_name
                    )
                    ai_data = await asyncio.to_thread(AIService.analyze_pr, pr, diff)
                    await asyncio.to_thread(
                        database.save_ai_review, number, pr["head_sha"], ai_data, repo_name
                    )
                    pr["ai_review"] = ai_data
                    job["completed"] += 1
                except (GitHubServiceError, Exception) as exc:
                    logger.warning("Analyze failed for PR #%s: %s", number, exc)
                    job["failed"] += 1
                    job["errors"].append({"pr_number": number, "error": str(exc)})

                JobService._publish(job)

            if job["status"] != "cancelled":
                job["status"] = "done" if not job["failed"] else "completed_with_errors"

        except asyncio.CancelledError:
            job["status"] = "cancelled"
            raise
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Job %s crashed: %s", job_id, exc)
            job["status"] = "failed"
            job["errors"].append({"error": str(exc)})
        finally:
            job["current"] = None
            job["finished_at"] = time.time()
            JobService._publish(job)
            _tasks.pop(job_id, None)

    @staticmethod
    def cancel(job_id: str) -> Optional[dict]:
        job = _jobs.get(job_id)
        if not job:
            return None
        if job["status"] in ("done", "failed", "cancelled", "completed_with_errors"):
            return job
        # Cooperative: the loop checks this between PRs so an in-flight LLM call
        # is allowed to finish rather than leaving a half-written review.
        job["cancel_requested"] = True
        JobService._publish(job)
        return job

    @staticmethod
    async def shutdown():
        for task in list(_tasks.values()):
            task.cancel()
        if _tasks:
            await asyncio.gather(*_tasks.values(), return_exceptions=True)
