from typing import Optional
from fastapi import APIRouter, HTTPException
from models import TagAddRequest, GroupCreateRequest, GroupItemAddRequest
from config import settings
import database

router = APIRouter(prefix="/api", tags=["Tags & Staging Groups"])

# Custom Tags Endpoints
@router.get("/tags")
def get_all_tags():
    tags_map = database.get_all_pr_tags_map()
    return {"tags_map": tags_map}

@router.get("/prs/{pr_number}/tags")
def get_pr_tags(pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    tags = database.get_pr_tags(pr_number, target_repo)
    return {"pr_number": pr_number, "repo_name": target_repo, "tags": tags}

@router.post("/prs/{pr_number}/tags")
def add_pr_tag(pr_number: int, req: TagAddRequest):
    target_repo = req.repo_name or settings.DEFAULT_REPO
    if not req.tag.strip():
        raise HTTPException(status_code=400, detail="Tag cannot be empty.")
    tags = database.add_pr_tag(pr_number, target_repo, req.tag)
    return {"pr_number": pr_number, "repo_name": target_repo, "tags": tags}

@router.delete("/prs/{pr_number}/tags/{tag}")
def remove_pr_tag(pr_number: int, tag: str, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    tags = database.remove_pr_tag(pr_number, target_repo, tag)
    return {"pr_number": pr_number, "repo_name": target_repo, "tags": tags}

# Staging Groups & Workspaces Endpoints
@router.get("/groups")
def get_groups():
    groups = database.get_groups()
    return {"groups": groups}

@router.post("/groups")
def create_group(req: GroupCreateRequest):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Group name cannot be empty.")
    try:
        group = database.create_group(req.name, req.description or "")
        return {"status": "success", "group": group}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create group: {e}")

@router.put("/groups/{group_id}")
def update_group(group_id: int, req: GroupCreateRequest):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Group name cannot be empty.")
    try:
        group = database.update_group(group_id, req.name, req.description or "")
        return {"status": "success", "group": group}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update group: {e}")

@router.delete("/groups/{group_id}")
def delete_group(group_id: int):
    database.delete_group(group_id)
    return {"status": "success", "group_id": group_id}

@router.get("/groups/{group_id}/items")
def get_group_items(group_id: int):
    items = database.get_group_items(group_id)
    return {"group_id": group_id, "items": items}

@router.post("/groups/{group_id}/items")
def add_group_items(group_id: int, req: GroupItemAddRequest):
    target_repo = req.repo_name or settings.DEFAULT_REPO
    items = database.add_prs_to_group(group_id, req.pr_numbers, target_repo)
    return {"group_id": group_id, "items": items}

@router.delete("/groups/{group_id}/items/{pr_number}")
def remove_group_item(group_id: int, pr_number: int, repo_name: Optional[str] = None):
    target_repo = repo_name or settings.DEFAULT_REPO
    items = database.remove_pr_from_group(group_id, pr_number, target_repo)
    return {"group_id": group_id, "items": items}
