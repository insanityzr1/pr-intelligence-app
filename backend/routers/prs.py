from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from models import PRSummaryItem, SyncRequest, AnalyzeRequest
from services.github_service import GitHubService
from services.ai_service import AIService
import database

router = APIRouter(prefix="/api/prs", tags=["PRs"])

# In-memory store for synced PRs
_prs_cache = {}

@router.post("/sync")
def sync_prs(req: SyncRequest):
    try:
        prs = GitHubService.fetch_prs(count=req.count, state=req.state, orderby=req.orderby)
        _prs_cache.clear()
        
        for pr in prs:
            num = pr["number"]
            # Check cached AI analysis
            cached_ai = database.get_cached_ai_review(num, pr["head_sha"])
            if cached_ai:
                pr["ai_review"] = cached_ai
            _prs_cache[num] = pr
            
        return {"status": "success", "count": len(prs), "prs": list(_prs_cache.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[PRSummaryItem])
def get_prs():
    if not _prs_cache:
        # Initial sync if empty
        sync_prs(SyncRequest(count=40))
    return list(_prs_cache.values())

@router.get("/{pr_number}")
def get_pr_detail(pr_number: int):
    if pr_number not in _prs_cache:
        raise HTTPException(status_code=404, detail="PR not found. Sync PRs first.")
    
    pr = _prs_cache[pr_number]
    
    # If AI review not computed yet, compute or retrieve
    if not pr.get("ai_review"):
        cached = database.get_cached_ai_review(pr_number, pr["head_sha"])
        if cached:
            pr["ai_review"] = cached
        else:
            diff = GitHubService.fetch_pr_diff(pr_number)
            ai_data = AIService.analyze_pr(pr, diff)
            database.save_ai_review(pr_number, pr["head_sha"], ai_data)
            pr["ai_review"] = ai_data
            
    return pr

@router.post("/analyze")
def analyze_prs(req: AnalyzeRequest):
    analyzed = []
    for num in req.pr_numbers:
        if num in _prs_cache:
            pr = _prs_cache[num]
            if req.force or not pr.get("ai_review"):
                diff = GitHubService.fetch_pr_diff(num)
                ai_data = AIService.analyze_pr(pr, diff)
                database.save_ai_review(num, pr["head_sha"], ai_data)
                pr["ai_review"] = ai_data
            analyzed.append(pr)
            
    return {"status": "success", "analyzed_count": len(analyzed), "prs": analyzed}
