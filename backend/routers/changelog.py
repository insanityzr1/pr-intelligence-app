from typing import Optional
from fastapi import APIRouter, HTTPException
from models import ChangelogRequest
from services.changelog_service import ChangelogService
from routers.prs import _prs_cache, _populate_memory_cache_from_db
import database

router = APIRouter(prefix="/api/changelog", tags=["Changelog"])

@router.get("")
def get_changelogs():
    logs = database.get_changelogs()
    return {"changelogs": logs}

@router.post("")
def generate_changelog(req: ChangelogRequest):
    _populate_memory_cache_from_db()
    selected_prs = [p for p in _prs_cache.values() if p.get("number") in req.pr_numbers]
    
    if not selected_prs:
        raise HTTPException(status_code=400, detail="No matching PRs found for selected IDs.")
        
    result = ChangelogService.generate_changelog(selected_prs)
    markdown_text = result.get("markdown", "")
    
    # Extract branches involved
    branches_set = set()
    for p in selected_prs:
        if p.get("headRefName"): branches_set.add(p["headRefName"])
        if p.get("baseRefName"): branches_set.add(p["baseRefName"])
    branches = list(branches_set)
    
    pr_nums_sorted = sorted([p["number"] for p in selected_prs])
    pr_str = ", ".join([f"#{num}" for num in pr_nums_sorted])
    title = f"Release Notes ({len(pr_nums_sorted)} PRs: {pr_str})"
    
    # Save to SQLite DB
    saved_record = database.save_changelog(
        title=title,
        pr_numbers=pr_nums_sorted,
        branches=branches,
        markdown=markdown_text
    )
    
    return {
        "status": "success",
        "id": saved_record["id"],
        "title": title,
        "pr_numbers": pr_nums_sorted,
        "branches": branches,
        "markdown": markdown_text,
        "created_at": "Just now"
    }

@router.delete("/{changelog_id}")
def delete_changelog(changelog_id: int):
    database.delete_changelog(changelog_id)
    return {"status": "success", "id": changelog_id}
