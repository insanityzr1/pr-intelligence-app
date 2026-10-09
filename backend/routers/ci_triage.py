import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from config import settings
import database
from models import CITriageRequest, BulkCITriageRequest, ApplyFixRequest
from routers.prs import _prs_cache, _populate_memory_cache_from_db
from services.ci_triage_service import CITriageService
from services.patch_service import PatchService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prs", tags=["CI Triage"])


def _get_pr_or_404(pr_number: int, repo_name: Optional[str] = None) -> dict:
    target_repo = repo_name or settings.DEFAULT_REPO
    _populate_memory_cache_from_db()
    cache_key = f"{target_repo}#{pr_number}"

    if cache_key in _prs_cache:
        return _prs_cache[cache_key]

    # Check fallback by PR number
    for pr in _prs_cache.values():
        if pr.get("number") == pr_number:
            return pr

    raise HTTPException(status_code=404, detail=f"PR #{pr_number} not found. Please sync PRs first.")


@router.post("/bulk/ci-triage")
def triage_bulk_prs(req: BulkCITriageRequest):
    if not req.pr_numbers:
        raise HTTPException(status_code=400, detail="pr_numbers list cannot be empty.")

    target_repo = req.repo_name or settings.DEFAULT_REPO
    results = []

    for num in req.pr_numbers:
        try:
            pr = _get_pr_or_404(num, target_repo)
            triage = CITriageService.triage_pr(pr_data=pr, force=req.force)
            results.append({
                "pr_number": num,
                "status": "success",
                "triage": triage
            })
        except Exception as e:
            results.append({
                "pr_number": num,
                "status": "error",
                "error": str(e)
            })

    return {
        "status": "success",
        "total": len(req.pr_numbers),
        "results": results
    }


@router.post("/{pr_number}/ci-triage")
def triage_single_pr(pr_number: int, req: Optional[CITriageRequest] = None):
    req = req or CITriageRequest()
    target_repo = req.repo_name or settings.DEFAULT_REPO
    pr = _get_pr_or_404(pr_number, target_repo)

    try:
        triage = CITriageService.triage_pr(
            pr_data=pr,
            custom_log=req.custom_log,
            force=req.force
        )
        head_ref = pr.get("headRefName", f"feature-pr-{pr_number}")
        apply_command = PatchService.format_git_apply_command(pr_number, target_repo, head_ref)

        return {
            "status": "success",
            "triage": triage,
            "apply_command": apply_command
        }
    except Exception as e:
        logger.error("CI triage failed for PR #%s: %s", pr_number, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{pr_number}/apply-fix")
def apply_fix_endpoint(pr_number: int, req: ApplyFixRequest):
    target_repo = req.repo_name or settings.DEFAULT_REPO
    pr = _get_pr_or_404(pr_number, target_repo)
    head_ref = pr.get("headRefName", f"feature-pr-{pr_number}")

    try:
        result = PatchService.apply_patch(
            repo_name=target_repo,
            pr_number=pr_number,
            head_ref=head_ref,
            patch_text=req.patch,
            commit_message=req.commit_message or f"fix(ci): remediate CI build for PR #{pr_number}",
            action=req.action,
            branch_name=req.branch_name
        )
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error("Failed to apply patch for PR #%s: %s", pr_number, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pr_number}/download-patch", response_class=PlainTextResponse)
def download_patch(pr_number: int, repo_name: Optional[str] = Query(None)):
    target_repo = repo_name or settings.DEFAULT_REPO
    pr = _get_pr_or_404(pr_number, target_repo)
    head_sha = pr.get("head_sha", "")

    cached = database.get_cached_ci_triage(pr_number, head_sha, target_repo)
    patch_text = cached.get("suggested_patch") if cached else ""
    commit_msg = cached.get("commit_message") if cached else f"fix(ci): fix PR #{pr_number}"

    if not patch_text:
        # Generate on the fly
        triage = CITriageService.triage_pr(pr_data=pr)
        patch_text = triage.get("suggested_patch", "")
        commit_msg = triage.get("commit_message", f"fix(ci): fix PR #{pr_number}")

    if not patch_text:
        patch_text = f"# No automated diff generated for PR #{pr_number}.\n"

    content = PatchService.format_patch_download(pr_number, target_repo, patch_text, commit_msg)
    filename = f"pr-{pr_number}-ci-fix.patch"

    return PlainTextResponse(
        content=content,
        media_type="text/x-diff",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
