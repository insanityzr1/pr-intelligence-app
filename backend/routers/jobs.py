from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from services.job_service import JobService

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


class AnalyzeJobRequest(BaseModel):
    pr_numbers: List[int]
    repo_name: Optional[str] = None
    force: bool = False


@router.post("/analyze")
async def start_analyze_job(req: AnalyzeJobRequest):
    # Must be `async def`: a sync route runs in FastAPI's threadpool, where
    # there is no running event loop and `asyncio.create_task` raises.
    """
    Queue a batch AI review and return immediately.

    The synchronous endpoint runs N sequential LLM calls inside one request,
    which for a large workspace is a multi-minute opaque await that a browser
    timeout can discard. Progress arrives over SSE as `job_update` events.
    """
    if not req.pr_numbers:
        raise HTTPException(status_code=400, detail="pr_numbers cannot be empty.")

    job = JobService.create_analyze_job(
        req.pr_numbers, req.repo_name or settings.DEFAULT_REPO, req.force
    )
    return {"job": _public(job)}


@router.get("")
def list_jobs(limit: int = 50):
    return {"jobs": [_public(j) for j in JobService.list_jobs(limit)]}


@router.get("/{job_id}")
def get_job(job_id: str):
    job = JobService.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"job": _public(job)}


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    job = JobService.cancel(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"job": _public(job)}


def _public(job: dict) -> dict:
    """Strip internal bookkeeping from the API surface."""
    return {k: v for k, v in job.items() if k != "cancel_requested"}
