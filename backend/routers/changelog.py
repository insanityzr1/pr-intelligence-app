from fastapi import APIRouter
from models import ChangelogRequest
from services.changelog_service import ChangelogService
from routers.prs import _prs_cache

router = APIRouter(prefix="/api/changelog", tags=["Changelog"])

@router.post("")
def generate_changelog(req: ChangelogRequest):
    selected_prs = [_prs_cache[num] for num in req.pr_numbers if num in _prs_cache]
    result = ChangelogService.generate_changelog(selected_prs)
    return result
