"""
Write-back endpoints.

Everything here mutates a real GitHub repository, so nothing in this module is
called implicitly by a read path — each action is an explicit request.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import database
from config import settings
from routers.prs import _prs_cache, _populate_memory_cache_from_db
from services.github_service import GitHubServiceError
from services.writeback_service import WriteBackService

router = APIRouter(prefix="/api/writeback", tags=["GitHub Write-Back"])


class PostReviewRequest(BaseModel):
    pr_number: int
    repo_name: Optional[str] = None


class SyncLabelsRequest(BaseModel):
    pr_number: int
    repo_name: Optional[str] = None


class MergeSequenceRequest(BaseModel):
    pr_numbers: List[int] = []
    group_id: Optional[int] = None
    repo_name: Optional[str] = None
    method: str = "squash"
    delete_branch: bool = False
    # Destructive by omission is unacceptable: the caller must opt out of the
    # dry run explicitly.
    dry_run: bool = True


@router.post("/review-comment")
def post_review_comment(req: PostReviewRequest):
    """Publish a PR's stored AI review as a comment on GitHub."""
    _populate_memory_cache_from_db()
    repo_name = req.repo_name or settings.DEFAULT_REPO
    pr = _prs_cache.get(f"{repo_name}#{req.pr_number}")

    if not pr:
        raise HTTPException(status_code=404, detail="PR not found. Sync PRs first.")

    review = pr.get("ai_review") or database.get_cached_ai_review(
        req.pr_number, pr.get("head_sha", ""), repo_name
    )
    if not review:
        raise HTTPException(
            status_code=400,
            detail="No AI review for this PR yet. Run an analysis first.",
        )

    try:
        return WriteBackService.post_review_comment(req.pr_number, repo_name, review)
    except GitHubServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/sync-labels")
def sync_labels(req: SyncLabelsRequest):
    """Mirror this PR's app tags onto GitHub as labels."""
    repo_name = req.repo_name or settings.DEFAULT_REPO
    tags = database.get_pr_tags(req.pr_number, repo_name)
    if not tags:
        raise HTTPException(status_code=400, detail="This PR has no tags to sync.")

    try:
        return WriteBackService.sync_labels(req.pr_number, repo_name, tags)
    except GitHubServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/merge-sequence")
def merge_sequence(req: MergeSequenceRequest):
    """
    Merge a workspace in order, aborting at the first failure.

    Defaults to a dry run. Once one merge fails, every later merge would target
    a base the simulation never modelled, so continuing is not safe.
    """
    repo_name = req.repo_name or settings.DEFAULT_REPO

    numbers = req.pr_numbers
    if req.group_id and not numbers:
        items = database.get_group_items(req.group_id)
        numbers = [i["pr_number"] for i in items if i["repo_name"] == repo_name]

    if not numbers:
        raise HTTPException(status_code=400, detail="No PRs to merge.")

    try:
        return WriteBackService.merge_sequence(
            numbers, repo_name, req.method, req.dry_run, req.delete_branch
        )
    except GitHubServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
