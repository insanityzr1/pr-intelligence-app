from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from config import settings
from models import PRSummaryItem, SyncRequest, AnalyzeRequest, ChatMessageRequest
from services.github_service import GitHubService
from services.ai_service import AIService
from services.conflict_resolution_service import ConflictResolutionService
import database

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

@router.get("", response_model=List[PRSummaryItem])
def get_prs(repo_name: Optional[str] = None):
    _populate_memory_cache_from_db()
    
    if not _prs_cache:
        sync_prs(SyncRequest(count=settings.PR_FETCH_LIMIT, repo_name=repo_name))
        
    all_prs = list(_prs_cache.values())
    if repo_name:
        return [p for p in all_prs if p.get("repo_name") == repo_name]
    return all_prs

@router.get("/{pr_number}")
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
@router.get("/{pr_number}/resolve-conflicts")
def resolve_conflicts(pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    cache_key = f"{target_repo}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "Conflicting PR", "repo_name": target_repo})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=target_repo)
    
    conflict_info = ConflictResolutionService.resolve_conflicts(pr, diff)
    return {"pr_number": pr_number, "conflict_info": conflict_info}

@router.get("/{pr_number}/conflict-bash-script")
def get_conflict_bash_script(pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    cache_key = f"{target_repo}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "Conflicting PR", "repo_name": target_repo})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=target_repo)
    
    conflict_info = ConflictResolutionService.resolve_conflicts(pr, diff)
    bash_text = ConflictResolutionService.generate_bash_script(pr_number, conflict_info)
    
    return PlainTextResponse(
        content=bash_text,
        media_type="application/x-sh",
        headers={"Content-Disposition": f"attachment; filename=resolve_conflict_pr_{pr_number}.sh"}
    )

@router.get("/{pr_number}/conflict-patch")
def get_conflict_patch(pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    cache_key = f"{target_repo}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "Conflicting PR", "repo_name": target_repo})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=target_repo)
    
    conflict_info = ConflictResolutionService.resolve_conflicts(pr, diff)
    patch_text = ConflictResolutionService.generate_patch(pr_number, conflict_info)
    
    return PlainTextResponse(
        content=patch_text,
        media_type="text/x-diff",
        headers={"Content-Disposition": f"attachment; filename=conflict_pr_{pr_number}.patch"}
    )
