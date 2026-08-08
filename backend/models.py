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
    labels: List[str]
    ai_review: Optional[dict] = None

class SyncRequest(BaseModel):
    count: int = 40
    state: str = "open"
    orderby: str = "updated-desc"

class AnalyzeRequest(BaseModel):
    pr_numbers: List[int]
    force: bool = False

class ChangelogRequest(BaseModel):
    pr_numbers: List[int]
