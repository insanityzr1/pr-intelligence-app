from fastapi import APIRouter, HTTPException
from models import RepoAddRequest
import database

router = APIRouter(prefix="/api/repos", tags=["Repositories"])

@router.get("")
def list_repos():
    return {"repositories": database.get_repositories()}

@router.post("")
def add_repo(req: RepoAddRequest):
    repo = req.repo_name.strip()
    if not repo or "/" not in repo:
        raise HTTPException(status_code=400, detail="Invalid repository format. Use 'owner/repository'.")
    database.add_repository(repo)
    return {"status": "success", "repositories": database.get_repositories()}

@router.delete("/{repo_owner}/{repo_name}")
def delete_repo(repo_owner: str, repo_name: str):
    full_name = f"{repo_owner}/{repo_name}"
    database.delete_repository(full_name)
    return {"status": "success", "repositories": database.get_repositories()}
