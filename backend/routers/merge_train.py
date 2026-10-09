import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from config import settings
import database
from models import MergeTrainSimulateRequest, MergeTrainPublishRequest
from routers.prs import _prs_cache, _populate_memory_cache_from_db
from services.git_service import GitService, GitServiceError, GitUnavailableError
from services.merge_train_service import MergeTrainService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/merge-train", tags=["Merge Train"])


def _resolve_prs(pr_numbers: list, repo_name: Optional[str] = None) -> list:
    _populate_memory_cache_from_db()
    target_repo = repo_name or settings.DEFAULT_REPO

    found = []
    for num in pr_numbers:
        key = f"{target_repo}#{num}"
        if key in _prs_cache:
            found.append(_prs_cache[key])
        else:
            # Fallback scan
            matched = [p for p in _prs_cache.values() if p.get("number") == num]
            if matched:
                found.append(matched[0])

    # If any PRs were missing from memory cache, query database directly
    if len(found) < len(pr_numbers):
        db_prs = database.get_cached_prs()
        for p in db_prs:
            if p.get("number") in pr_numbers and not any(f.get("number") == p.get("number") for f in found):
                found.append(p)

    return found


@router.post("/simulate")
def simulate_train_endpoint(req: MergeTrainSimulateRequest):
    if not req.pr_numbers:
        raise HTTPException(status_code=400, detail="pr_numbers cannot be empty.")

    target_repo = req.repo_name or settings.DEFAULT_REPO
    prs = _resolve_prs(req.pr_numbers, target_repo)

    if not prs:
        raise HTTPException(status_code=404, detail="No matching pull requests found in cache. Please sync PRs first.")

    try:
        result = MergeTrainService.simulate_train(
            prs=prs,
            repo_name=target_repo,
            base_branch=req.base_branch or "main",
            auto_order=req.auto_order
        )
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error("Merge train simulation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/publish")
def publish_train_endpoint(req: MergeTrainPublishRequest):
    if not req.staging_branch:
        raise HTTPException(status_code=400, detail="staging_branch name is required.")
    if not req.final_commit:
        raise HTTPException(status_code=400, detail="final_commit SHA is required.")

    target_repo = req.repo_name or settings.DEFAULT_REPO

    try:
        result = MergeTrainService.publish_staging_branch(
            repo_name=target_repo,
            staging_branch=req.staging_branch,
            final_commit=req.final_commit,
            pr_numbers=req.pr_numbers,
            create_pr=req.create_pr,
            pr_title=req.pr_title,
            pr_body=req.pr_body
        )
        return {"status": "success", "result": result}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to publish staging branch: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def merge_train_capability():
    enabled = settings.GIT_MERGE_ENABLED
    if not enabled:
        return {"enabled": False, "reason": "GIT_MERGE_ENABLED=false"}
    try:
        GitService.ensure_supported()
        v = GitService.git_version()
        return {"enabled": True, "git_version": f"{v[0]}.{v[1]}"}
    except GitUnavailableError as exc:
        return {"enabled": False, "reason": str(exc)}
