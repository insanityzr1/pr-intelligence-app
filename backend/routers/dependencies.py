from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import database
from config import settings
from routers.prs import _prs_cache, _populate_memory_cache_from_db
from services.dependency_service import DependencyService
from services.git_service import GitService, GitServiceError, GitUnavailableError

router = APIRouter(prefix="/api/dependencies", tags=["PR Dependencies"])


class GraphRequest(BaseModel):
    repo_name: Optional[str] = None
    group_id: Optional[int] = None
    pr_numbers: List[int] = []
    # Ancestry detection needs a mirror clone; skip it when only the explicit
    # base-branch relationship is wanted.
    use_ancestry: bool = True


@router.post("/graph")
def dependency_graph(req: GraphRequest):
    """
    Stacked-PR graph for a repository or workspace.

    Detects PRs branched off other PRs — invisible to the app before now, and
    actively *misreported* as conflicts by the file-overlap heuristic, since a
    stacked PR necessarily touches its parent's files.
    """
    _populate_memory_cache_from_db()
    repo_name = req.repo_name or settings.DEFAULT_REPO

    prs = [p for p in _prs_cache.values() if p.get("repo_name") == repo_name]

    if req.group_id:
        items = database.get_group_items(req.group_id)
        wanted = {(i["repo_name"], i["pr_number"]) for i in items}
        prs = [p for p in prs if (p.get("repo_name"), p.get("number")) in wanted]
    elif req.pr_numbers:
        prs = [p for p in prs if p.get("number") in req.pr_numbers]

    if not prs:
        raise HTTPException(status_code=404, detail="No matching PRs found. Sync PRs first.")

    repo_path = None
    ancestry_error = None
    if req.use_ancestry and settings.GIT_MERGE_ENABLED:
        try:
            repo_path = GitService.ensure_mirror(repo_name)
        except (GitServiceError, GitUnavailableError) as exc:
            # Degrade to explicit-base detection rather than failing outright.
            ancestry_error = str(exc)

    graph = DependencyService.build_graph(prs, repo_path)
    graph["merge_order"] = DependencyService.merge_order(graph["nodes"], graph["edges"])
    graph["ancestry_available"] = repo_path is not None
    if ancestry_error:
        graph["ancestry_error"] = ancestry_error
    return graph
