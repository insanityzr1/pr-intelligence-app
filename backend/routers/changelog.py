from fastapi import APIRouter
from models import ChangelogRequest
from services.changelog_service import ChangelogService
from routers.prs import _prs_cache, _populate_memory_cache_from_db

router = APIRouter(prefix="/api/changelog", tags=["Changelog"])

@router.post("")
def generate_changelog(req: ChangelogRequest):
    _populate_memory_cache_from_db()
    selected_prs = [p for p in _prs_cache.values() if p.get("number") in req.pr_numbers]
    result = ChangelogService.generate_changelog(selected_prs)
    return result
