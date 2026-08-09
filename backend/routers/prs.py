import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from config import settings
from models import PRListItem, PRDetailItem, SyncRequest, AnalyzeRequest, ChatMessageRequest
from services.github_service import GitHubService
from services.ai_service import AIService
from services.conflict_resolution_service import ConflictResolutionService
from services.build_service import BuildService
from services.git_service import GitService, GitServiceError, GitUnavailableError
import database

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prs", tags=["PRs"])

# In-memory store for synced PRs
_prs_cache = {}

def _populate_memory_cache_from_db():
    global _prs_cache
    if not _prs_cache:
        db_prs = database.get_cached_prs()
        if db_prs:
            for pr in db_prs:
                num = pr.get("number")
                repo_name = pr.get("repo_name", settings.DEFAULT_REPO)
                cache_key = f"{repo_name}#{num}"
                cached_ai = database.get_cached_ai_review(num, pr.get("head_sha", ""), repo_name)
                if cached_ai:
                    pr["ai_review"] = cached_ai
                _prs_cache[cache_key] = pr

@router.post("/sync")
def sync_prs(req: SyncRequest):
    try:
        repo_name = req.repo_name or settings.DEFAULT_REPO
        fetch_count = req.count if (req.count and req.count > 0) else settings.PR_FETCH_LIMIT
        
        prs = GitHubService.fetch_prs(count=fetch_count, state=req.state, orderby=req.orderby, repo_name=repo_name)
        
        database.save_prs(prs, repo_name)
        
        for pr in prs:
            num = pr["number"]
            cache_key = f"{repo_name}#{num}"
            cached_ai = database.get_cached_ai_review(num, pr["head_sha"], repo_name)
            if cached_ai:
                pr["ai_review"] = cached_ai
            _prs_cache[cache_key] = pr
            
        all_prs = list(_prs_cache.values())
        if repo_name:
            filtered = [p for p in all_prs if p.get("repo_name") == repo_name]
            return {"status": "success", "count": len(filtered), "prs": filtered}
        return {"status": "success", "count": len(all_prs), "prs": all_prs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[PRListItem])
def get_prs(repo_name: Optional[str] = None):
    _populate_memory_cache_from_db()
    
    if not _prs_cache:
        sync_prs(SyncRequest(count=settings.PR_FETCH_LIMIT, repo_name=repo_name))
        
    all_prs = list(_prs_cache.values())
    if repo_name:
        return [p for p in all_prs if p.get("repo_name") == repo_name]
    return all_prs

@router.get("/{pr_number}", response_model=PRDetailItem)
def get_pr_detail(pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    cache_key = f"{target_repo}#{pr_number}"
    
    _populate_memory_cache_from_db()
    
    if cache_key not in _prs_cache:
        found = [p for p in _prs_cache.values() if p["number"] == pr_number]
        if found:
            pr = found[0]
        else:
            raise HTTPException(status_code=404, detail="PR not found. Sync PRs first.")
    else:
        pr = _prs_cache[cache_key]
    
    # Use the repo the PR actually belongs to — the fallback lookup above may have
    # matched a PR from a different repository than `target_repo`.
    pr_repo = pr.get("repo_name") or target_repo

    if not pr.get("ai_review"):
        cached = database.get_cached_ai_review(pr_number, pr["head_sha"], pr_repo)
        if cached:
            pr["ai_review"] = cached
        else:
            diff = GitHubService.fetch_pr_diff(pr_number, repo_name=pr_repo)
            ai_data = AIService.analyze_pr(pr, diff)
            database.save_ai_review(pr_number, pr["head_sha"], ai_data, pr_repo)
            pr["ai_review"] = ai_data
            
    return pr

@router.post("/analyze")
def analyze_prs(req: AnalyzeRequest):
    analyzed = []
    repo_name = req.repo_name or settings.DEFAULT_REPO
    
    for num in req.pr_numbers:
        cache_key = f"{repo_name}#{num}"
        if cache_key in _prs_cache:
            pr = _prs_cache[cache_key]
            if req.force or not pr.get("ai_review"):
                diff = GitHubService.fetch_pr_diff(num, repo_name=repo_name)
                ai_data = AIService.analyze_pr(pr, diff)
                database.save_ai_review(num, pr["head_sha"], ai_data, repo_name)
                pr["ai_review"] = ai_data
            analyzed.append(pr)
            
    return {"status": "success", "analyzed_count": len(analyzed), "prs": analyzed}

# Interactive AI Chat endpoints per PR
@router.get("/{pr_number}/chat")
def get_chat_history(pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    history = database.get_pr_chat_history(pr_number, target_repo)
    return {"pr_number": pr_number, "history": history}

@router.post("/{pr_number}/chat")
def post_chat_message(pr_number: int, req: ChatMessageRequest):
    repo_name = req.repo_name or settings.DEFAULT_REPO
    user_msg = req.message.strip()
    
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
        
    database.add_pr_chat_message(pr_number, repo_name, "user", user_msg)
    
    cache_key = f"{repo_name}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "PR"})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=repo_name)
    
    ai_text = AIService.chat_response(pr, diff, user_msg)
    database.add_pr_chat_message(pr_number, repo_name, "assistant", ai_text)
    
    history = database.get_pr_chat_history(pr_number, repo_name)
    return {"pr_number": pr_number, "history": history}

# AI Merge Conflict Resolution endpoints
def _conflict_info_for(pr_number: int, repo_name: Optional[str], force: bool = False):
    """
    Resolve (and cache) conflict guidance for a PR.

    All three conflict routes previously ran the same uncached LLM call, so
    viewing the resolver and then downloading the script and the patch cost
    three separate model round-trips for identical output. Cached on head_sha,
    so a new push to the PR invalidates it.
    """
    target_repo = repo_name or settings.DEFAULT_REPO
    cache_key = f"{target_repo}#{pr_number}"
    pr = _prs_cache.get(
        cache_key,
        {"number": pr_number, "title": "Conflicting PR", "repo_name": target_repo},
    )
    head_sha = pr.get("head_sha", "")

    if not force and head_sha:
        cached = database.get_cached_conflict_resolution(pr_number, head_sha, target_repo)
        if cached:
            return cached

    # Prefer real conflict markers from an actual merge. The resolver used to
    # reason over a truncated slice of the PR diff, which never contained the
    # conflict at all — it was inferring one.
    context, real_conflict_files = "", []
    try:
        state = BuildService.pr_merge_state(pr)
        real_conflict_files = state["conflict_files"]
        if not state["clean"]:
            context = BuildService.conflict_context(pr)
    except (GitServiceError, GitUnavailableError) as exc:
        logger.info("Falling back to diff context for PR #%s: %s", pr_number, exc)

    if not context:
        context = GitHubService.fetch_pr_diff(pr_number, repo_name=target_repo)

    conflict_info = ConflictResolutionService.resolve_conflicts(pr, context)
    if real_conflict_files:
        conflict_info["conflicting_files"] = real_conflict_files

    if head_sha:
        database.save_conflict_resolution(pr_number, head_sha, conflict_info, target_repo)
    return conflict_info


@router.get("/{pr_number}/resolve-conflicts")
def resolve_conflicts(pr_number: int, repo_name: Optional[str] = None, force: bool = False):
    conflict_info = _conflict_info_for(pr_number, repo_name, force)
    return {"pr_number": pr_number, "conflict_info": conflict_info}

@router.get("/{pr_number}/conflict-bash-script")
def get_conflict_bash_script(pr_number: int, repo_name: Optional[str] = None):
    conflict_info = _conflict_info_for(pr_number, repo_name)
    bash_text = ConflictResolutionService.generate_bash_script(pr_number, conflict_info)


    return PlainTextResponse(
        content=bash_text,
        media_type="application/x-sh",
        headers={"Content-Disposition": f"attachment; filename=resolve_conflict_pr_{pr_number}.sh"}
    )

@router.get("/{pr_number}/conflict-patch")
def get_conflict_patch(pr_number: int, repo_name: Optional[str] = None):
    """
    A real, appliable patch for merging this PR into its base.

    This previously returned a comment header plus the model's prose, served as
    `text/x-diff`; `git apply` rejected it every time. It is now produced by
    `git diff` against the real merged tree and passes `git apply --check`.
    The LLM narrative is only used if git is genuinely unavailable.
    """
    target_repo = repo_name or settings.DEFAULT_REPO
    pr = _prs_cache.get(
        f"{target_repo}#{pr_number}",
        {"number": pr_number, "repo_name": target_repo, "baseRefName": "main"},
    )

    try:
        state = BuildService.pr_merge_state(pr)
        patch_body = GitService.diff_patch(state["repo_path"], state["base"], state["tree"])
        note = (
            "# Clean merge.\n" if state["clean"]
            else "# NOTE: this merge has conflicts; the tree below contains conflict markers.\n"
            f"# Conflicted files: {', '.join(state['conflict_files'])}\n"
        )
        header = (
            f"# Merge of PR #{pr_number} into {state['base_branch']} ({target_repo})\n{note}"
        )
        return PlainTextResponse(
            content=header + patch_body,
            media_type="text/x-diff",
            headers={"Content-Disposition": f"attachment; filename=merge_pr_{pr_number}.patch"},
        )
    except (GitServiceError, GitUnavailableError) as exc:
        logger.warning("Real patch unavailable for PR #%s: %s", pr_number, exc)

    conflict_info = _conflict_info_for(pr_number, repo_name)
    patch_text = ConflictResolutionService.generate_patch(pr_number, conflict_info)
    return PlainTextResponse(
        content=patch_text,
        media_type="text/x-diff",
        headers={"Content-Disposition": f"attachment; filename=conflict_pr_{pr_number}.patch"}
    )
