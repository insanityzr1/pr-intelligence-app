from typing import List, Optional
from pydantic import BaseModel

class PRSummaryItem(BaseModel):
    number: int
    id_str: str
    url: str
    title: str
    status: str
    summary: str
    type: str
    subtype: str
    current_status: str
    risk: str
    risk_detail: str
    risk_score: int
    rec_action: str
    changed_files: int
    additions: int
    deletions: int
    mergeable: str
    author: str
    updated_at: str
    updated_rel: str
    created_at: str
    created_fmt: str
    head_sha: str
    repo_name: str = "rpnunez/wp-ai-scheduler"
    labels: List[str]
    user_tags: Optional[List[str]] = []
    ai_review: Optional[dict] = None

class SyncRequest(BaseModel):
    count: Optional[int] = None
    state: str = "open"
    orderby: str = "updated-desc"
    repo_name: Optional[str] = None

class AnalyzeRequest(BaseModel):
    pr_numbers: List[int]
    force: bool = False
    repo_name: Optional[str] = None

class RepoAddRequest(BaseModel):
    repo_name: str

class ChatMessageRequest(BaseModel):
    message: str
    repo_name: Optional[str] = None

class ChangelogRequest(BaseModel):
    pr_numbers: List[int]
    workspace_name: Optional[str] = None
    group_id: Optional[int] = None

class TagAddRequest(BaseModel):
    tag: str
    repo_name: Optional[str] = None

class GroupCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""

class GroupItemAddRequest(BaseModel):
    pr_numbers: List[int]
    repo_name: Optional[str] = None
