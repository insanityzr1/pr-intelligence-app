from fastapi import APIRouter
from services.conflict_service import ConflictService
from routers.prs import _prs_cache

router = APIRouter(prefix="/api/conflicts", tags=["Conflicts"])

@router.get("")
def get_conflicts():
    prs = list(_prs_cache.values())
    collisions = ConflictService.detect_file_collisions(prs)
    return {
        "total_collisions": len(collisions),
        "collisions": collisions
    }
