from typing import List, Optional
from pydantic import BaseModel, Field
from config import settings

class PRGitRef(BaseModel):
    headRefName: str = ""
    baseRefName: str = "main"
    head_sha: str = ""

class PRCheckState(BaseModel):
    checks_state: str = "NONE"          # PASSING | FAILING | PENDING | NONE
    checks_passed: int = 0
    checks_failed: int = 0
    checks_pending: int = 0
    failed_checks: List[str] = []
    review_decision: str = ""           # APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | ''

class PRRiskAssessment(BaseModel):
    risk: str = "Low"
    risk_score: int = 1
    risk_detail: str = ""
    rec_action: str = ""

class BasePRModel(BaseModel):
    number: int
    id_str: str
    url: str
    title: str
    status: str
    summary: str
    type: str
    subtype: str
    current_status: str
    author: str
    repo_name: str = Field(default_factory=lambda: settings.DEFAULT_REPO)
    labels: List[str] = []
    updated_rel: str = ""

class PRListItem(BasePRModel):
    changed_files: int = 0
    mergeable: str = "UNKNOWN"
    head_sha: str = ""
    headRefName: str = ""
    baseRefName: str = "main"
    checks_state: str = "NONE"
    review_decision: str = ""
    risk: str = "Low"
    risk_score: int = 1

class PRDetailItem(PRListItem):
    body: str = ""
    additions: int = 0
    deletions: int = 0
    created_at: str = ""
    created_fmt: str = ""
    updated_at: str = ""
    risk_detail: str = ""
    rec_action: str = ""
    checks_passed: int = 0
    checks_failed: int = 0
    checks_pending: int = 0
    failed_checks: List[str] = []
    reviewers: List[str] = []
    user_tags: Optional[List[str]] = []
    ai_review: Optional[dict] = None

# Backward compatibility alias
PRSummaryItem = PRListItem

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
