from fastapi import APIRouter
from services.conflict_service import ConflictService
from routers.prs import _prs_cache, _populate_memory_cache_from_db

router = APIRouter(prefix="/api/conflicts", tags=["Conflicts"])

@router.get("")
def get_conflicts():
    # Hydrate from SQLite first: this router reads the same in-process cache as
    # /api/prs, and without this it returns an empty map until that route is hit.
    _populate_memory_cache_from_db()

    prs = list(_prs_cache.values())
    result = ConflictService.detect_file_collisions(prs)
    collisions = result["collisions"]
    return {
        "total_collisions": len(collisions),
        "collisions": collisions,
        "scanned_prs": len(prs),
        "skipped": result["skipped"],
    }
