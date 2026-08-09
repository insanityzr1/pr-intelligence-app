from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

import database
from config import settings
from routers.prs import _prs_cache, _populate_memory_cache_from_db
from services.build_service import BuildService
from services.git_service import GitService, GitServiceError, GitUnavailableError

router = APIRouter(prefix="/api/build", tags=["Build Simulation"])


class SimulateRequest(BaseModel):
    pr_numbers: List[int] = []
    repo_name: Optional[str] = None
    group_id: Optional[int] = None
    # Explicit merge order; defaults to the workspace's own order.
    order: Optional[List[int]] = None


def _resolve_prs(req: SimulateRequest) -> List[dict]:
    _populate_memory_cache_from_db()

    if req.group_id:
        items = database.get_group_items(req.group_id)
        if not items:
            raise HTTPException(status_code=400, detail="Workspace is empty or does not exist.")
        wanted = {(i["repo_name"], i["pr_number"]) for i in items}
        return [p for p in _prs_cache.values() if (p.get("repo_name"), p.get("number")) in wanted]

    if not req.pr_numbers:
        raise HTTPException(status_code=400, detail="Provide pr_numbers or a group_id.")

    return [
        p for p in _prs_cache.values()
        if p.get("number") in req.pr_numbers
        and (not req.repo_name or p.get("repo_name") == req.repo_name)
    ]


@router.post("/simulate")
def simulate_build(req: SimulateRequest):
    """
    Merge a set of PRs together for real and report what breaks.

    This is the question a PR Workspace exists to answer and that GitHub's
    per-PR `mergeable` flag cannot: two PRs can each merge cleanly into main and
    still conflict with each other.
    """
    prs = _resolve_prs(req)
    if not prs:
        raise HTTPException(status_code=404, detail="No matching PRs found. Sync PRs first.")
    return BuildService.simulate(prs, order=req.order)


@router.post("/readiness")
def build_readiness(req: SimulateRequest):
    """
    Everything blocking this workspace from shipping: red CI, outstanding
    reviews, drafts, and PRs that do not merge with the rest of the set.
    """
    prs = _resolve_prs(req)
    if not prs:
        raise HTTPException(status_code=404, detail="No matching PRs found. Sync PRs first.")

    simulation = BuildService.simulate(prs, order=req.order)
    return {
        "readiness": BuildService.readiness(prs, simulation),
        "simulation": simulation,
    }


@router.get("/status")
def build_capability():
    """Whether real merge simulation is usable, so the UI can explain itself."""
    if not settings.GIT_MERGE_ENABLED:
        return {"enabled": False, "reason": "GIT_MERGE_ENABLED=false"}
    try:
        GitService.ensure_supported()
        version = GitService.git_version()
        return {"enabled": True, "git_version": f"{version[0]}.{version[1]}"}
    except GitUnavailableError as exc:
        return {"enabled": False, "reason": str(exc)}


@router.get("/patch")
def build_patch(group_id: Optional[int] = None, repo_name: Optional[str] = None):
    """
    A real, appliable patch for the merged result of a workspace.

    The old per-PR `.patch` endpoint emitted a comment header plus LLM prose,
    which `git apply` rejects. This is produced by `git diff` against the
    simulated merge tree and passes `git apply --check`.
    """
    prs = _resolve_prs(SimulateRequest(group_id=group_id, repo_name=repo_name))
    if not prs:
        raise HTTPException(status_code=404, detail="No matching PRs found.")

    result = BuildService.simulate(prs)
    target = next(
        (r for r in result["repos"] if r.get("available") and (not repo_name or r["repo_name"] == repo_name)),
        None,
    )
    if not target:
        raise HTTPException(status_code=409, detail=result.get("reason") or "Merge simulation unavailable.")

    try:
        path = GitService.ensure_mirror(target["repo_name"])
        base = GitService.base_ref(target["base_branch"])
        patch = GitService.diff_patch(path, base, target["tree"])
    except GitServiceError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    header = (
        f"# Simulated build for {target['repo_name']} onto {target['base_branch']}\n"
        f"# Merged cleanly: {', '.join(target['merged']) or 'none'}\n"
        f"# Blocked by conflicts: {', '.join(target['blocked']) or 'none'}\n"
    )
    return PlainTextResponse(
        content=header + patch,
        media_type="text/x-diff",
        headers={"Content-Disposition": "attachment; filename=simulated_build.patch"},
    )
