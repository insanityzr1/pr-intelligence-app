from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from models import PRSummaryItem, SyncRequest, AnalyzeRequest, ChatMessageRequest
from services.github_service import GitHubService
from services.ai_service import AIService
from services.conflict_resolution_service import ConflictResolutionService
import database

router = APIRouter(prefix="/api/prs", tags=["PRs"])

# In-memory store for synced PRs
_prs_cache = {}

@router.post("/sync")
def sync_prs(req: SyncRequest):
    try:
        repo_name = req.repo_name or "rpnunez/wp-ai-scheduler"
        prs = GitHubService.fetch_prs(count=req.count, state=req.state, orderby=req.orderby, repo_name=repo_name)
        
        for pr in prs:
            num = pr["number"]
            cache_key = f"{repo_name}#{num}"
            cached_ai = database.get_cached_ai_review(num, pr["head_sha"])
            if cached_ai:
                pr["ai_review"] = cached_ai
            _prs_cache[cache_key] = pr
            
        return {"status": "success", "count": len(prs), "prs": list(_prs_cache.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[PRSummaryItem])
def get_prs(repo_name: Optional[str] = None):
    if not _prs_cache:
        sync_prs(SyncRequest(count=40, repo_name=repo_name))
        
    all_prs = list(_prs_cache.values())
    if repo_name:
        return [p for p in all_prs if p.get("repo_name") == repo_name]
    return all_prs

@router.get("/{pr_number}")
def get_pr_detail(pr_number: int, repo_name: Optional[str] = "rpnunez/wp-ai-scheduler"):
    cache_key = f"{repo_name}#{pr_number}"
    
    if cache_key not in _prs_cache:
        # Fallback search
        found = [p for p in _prs_cache.values() if p["number"] == pr_number]
        if found:
            pr = found[0]
        else:
            raise HTTPException(status_code=404, detail="PR not found. Sync PRs first.")
    else:
        pr = _prs_cache[cache_key]
    
    if not pr.get("ai_review"):
        cached = database.get_cached_ai_review(pr_number, pr["head_sha"])
        if cached:
            pr["ai_review"] = cached
        else:
            diff = GitHubService.fetch_pr_diff(pr_number, repo_name=pr.get("repo_name"))
            ai_data = AIService.analyze_pr(pr, diff)
            database.save_ai_review(pr_number, pr["head_sha"], ai_data)
            pr["ai_review"] = ai_data
            
    return pr

@router.post("/analyze")
def analyze_prs(req: AnalyzeRequest):
    analyzed = []
    repo_name = req.repo_name or "rpnunez/wp-ai-scheduler"
    
    for num in req.pr_numbers:
        cache_key = f"{repo_name}#{num}"
        if cache_key in _prs_cache:
            pr = _prs_cache[cache_key]
            if req.force or not pr.get("ai_review"):
                diff = GitHubService.fetch_pr_diff(num, repo_name=repo_name)
                ai_data = AIService.analyze_pr(pr, diff)
                database.save_ai_review(num, pr["head_sha"], ai_data)
                pr["ai_review"] = ai_data
            analyzed.append(pr)
            
    return {"status": "success", "analyzed_count": len(analyzed), "prs": analyzed}

# Interactive AI Chat endpoints per PR
@router.get("/{pr_number}/chat")
def get_chat_history(pr_number: int, repo_name: Optional[str] = "rpnunez/wp-ai-scheduler"):
    history = database.get_pr_chat_history(pr_number, repo_name)
    return {"pr_number": pr_number, "history": history}

@router.post("/{pr_number}/chat")
def post_chat_message(pr_number: int, req: ChatMessageRequest):
    repo_name = req.repo_name or "rpnunez/wp-ai-scheduler"
    user_msg = req.message.strip()
    
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
        
    # Save user message to persistent SQLite database
    database.add_pr_chat_message(pr_number, repo_name, "user", user_msg)
    
    # Fetch PR context
    cache_key = f"{repo_name}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "PR"})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=repo_name)
    
    # Prompt LLM with PR context + User question
    prompt = f"""
You are an expert AI pair programming assistant and code reviewer analyzing PR #{pr_number} ({pr.get('title')}) in `{repo_name}`.

PR Metadata:
- Author: {pr.get('author')}
- Type: {pr.get('type')} / Subtype: {pr.get('subtype')}
- Summary: {pr.get('summary')}

Diff Excerpt:
{diff[:2000]}

User Question:
{user_msg}

Answer concisely, accurately, and professionally. If code snippets or unit tests are requested, format them cleanly in markdown.
"""
    try:
        ai_resp = AIService._call_openai(prompt) if AIService._call_openai else None
        if not ai_resp or not isinstance(ai_resp, dict):
            ai_text = f"Analyzed PR #{pr_number}: {user_msg}\n\nKey Recommendations:\n- Review diff changes carefully.\n- Add unit tests for boundary scenarios."
        else:
            ai_text = ai_resp.get("ai_summary", str(ai_resp))
    except Exception:
        ai_text = f"Response for PR #{pr_number}: Ensure code changes in {pr.get('title')} maintain test coverage and pass static syntax checks."

    # Save assistant response to DB
    database.add_pr_chat_message(pr_number, repo_name, "assistant", ai_text)
    
    history = database.get_pr_chat_history(pr_number, repo_name)
    return {"pr_number": pr_number, "history": history}

# AI Merge Conflict Resolution endpoints
@router.get("/{pr_number}/resolve-conflicts")
def resolve_conflicts(pr_number: int, repo_name: Optional[str] = "rpnunez/wp-ai-scheduler"):
    cache_key = f"{repo_name}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "Conflicting PR", "repo_name": repo_name})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=repo_name)
    
    conflict_info = ConflictResolutionService.resolve_conflicts(pr, diff)
    return {"pr_number": pr_number, "conflict_info": conflict_info}

@router.get("/{pr_number}/conflict-patch")
def get_conflict_patch(pr_number: int, repo_name: Optional[str] = "rpnunez/wp-ai-scheduler"):
    cache_key = f"{repo_name}#{pr_number}"
    pr = _prs_cache.get(cache_key, {"number": pr_number, "title": "Conflicting PR", "repo_name": repo_name})
    diff = GitHubService.fetch_pr_diff(pr_number, repo_name=repo_name)
    
    conflict_info = ConflictResolutionService.resolve_conflicts(pr, diff)
    patch_text = ConflictResolutionService.generate_patch(pr_number, conflict_info)
    
    return PlainTextResponse(
        content=patch_text,
        media_type="text/x-diff",
        headers={"Content-Disposition": f"attachment; filename=conflict_pr_{pr_number}.patch"}
    )
